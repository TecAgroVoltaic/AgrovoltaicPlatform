"""
Lazo conversacional del agente (tool-use manual con el SDK oficial de Anthropic).

El agente no sabe de fisica: solo orquesta. Manda la pregunta al modelo con la
herramienta `forecast` disponible; cuando el modelo decide llamarla, el lazo la
ejecuta (run_forecast) y le devuelve el resultado; el modelo redacta la respuesta
final en espanol. Es el patron manual de tool-use (no el tool-runner beta), para
tener control total del ciclo y no filtrar el razonamiento interno.
"""
from __future__ import annotations

import json
import time

import anthropic

from pronostico import config, costos
from pronostico.agent.prompts import SYSTEM_PROMPT
from pronostico.tools.forecast_tool import FORECAST_TOOL_SCHEMA, run_forecast


class ForecastAgent:
    """Orquestador conversacional sobre la herramienta `forecast`."""

    def __init__(self, client=None, model: str = config.MODEL):
        # anthropic.Anthropic() lee ANTHROPIC_API_KEY del entorno.
        self.client = client or anthropic.Anthropic()
        self.model = model

    def conversar(self, pregunta: str) -> dict:
        """Responde y devuelve la TRAZA completa (para el debugger).

        Mismo lazo tool-use, pero registrando cada paso: turnos del modelo (texto
        + tools que pide) y cada ejecucion de `forecast` (input, salida cruda,
        error, ms). Dict JSON-serializable. `ask()` es azucar sobre esto (DRY)."""
        messages = [{"role": "user", "content": pregunta}]
        pasos: list[dict] = []
        usage = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
        t0 = time.perf_counter()
        respuesta = ""
        while True:
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=config.MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=[FORECAST_TOOL_SCHEMA],
                messages=messages,
            )
            usage["requests"] += 1
            if resp.usage:
                usage["input_tokens"] += resp.usage.input_tokens
                usage["output_tokens"] += resp.usage.output_tokens

            texto = "".join(b.text for b in resp.content if b.type == "text").strip()
            solicita = [{"id": b.id, "nombre": b.name, "input": b.input}
                        for b in resp.content if b.type == "tool_use"]
            if texto or solicita:
                pasos.append({"tipo": "modelo", "texto": texto,
                              "solicita": solicita, "stop_reason": resp.stop_reason})

            if resp.stop_reason == "refusal":
                respuesta = "No puedo responder a eso."
                break

            if resp.stop_reason in ("end_turn", "max_tokens"):
                respuesta = texto
                break

            if resp.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": resp.content})
                continue

            # stop_reason == "tool_use": ejecutar la(s) herramienta(s) y devolver resultados.
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for b in resp.content:
                if b.type != "tool_use":
                    continue
                ts = time.perf_counter()
                try:
                    out = run_forecast(**b.input)
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": out, "error": False,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": json.dumps(out, ensure_ascii=False),
                    })
                except Exception as e:  # el modelo vera el error y podra reaccionar
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": str(e), "error": True,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": f"Error: {e}",
                        "is_error": True,
                    })
            messages.append({"role": "user", "content": results})

        return {
            "pregunta": pregunta,
            "respuesta": respuesta,
            "modelo": self.model,
            "pasos": pasos,
            "usage": usage,
            "costo": costos.costo(usage, self.model),  # USD de esta consulta
            "ms_total": int((time.perf_counter() - t0) * 1000),
        }

    def ask(self, pregunta: str) -> str:
        """Responde una pregunta en lenguaje natural (solo el texto final)."""
        return self.conversar(pregunta)["respuesta"]

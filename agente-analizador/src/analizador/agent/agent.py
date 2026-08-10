"""Lazo conversacional del analizador (tool-use manual con el SDK de Anthropic).

El agente no sabe SQL ni fisica: solo orquesta. Manda la pregunta al modelo con las
tools disponibles; cuando el modelo llama una, el lazo la ejecuta (DISPATCH) y le
devuelve el JSON; el modelo redacta la respuesta final en espanol. Patron manual
(no el tool-runner beta) para control total y no filtrar el razonamiento interno.

Es GENERICO sobre el registro de tools: no hay logica de ninguna tool aqui.
"""
from __future__ import annotations

import json
import time

import anthropic

from analizador import config, costos, tools
from analizador.agent.prompts import SYSTEM_PROMPT


class Analizador:
    """Orquestador conversacional sobre el registro de tools de analisis."""

    def __init__(self, client=None, model: str = config.MODEL):
        # anthropic.Anthropic() lee ANTHROPIC_API_KEY del entorno.
        self.client = client or anthropic.Anthropic()
        self.model = model

    def conversar(self, pregunta: str) -> dict:
        """Responde y devuelve la TRAZA completa (para el debugger).

        Corre el mismo lazo tool-use, pero registra cada paso: los turnos del
        modelo (texto + tools que pide) y cada ejecucion de tool (input, salida
        cruda, error, ms). El dict es JSON-serializable tal cual. `preguntar()`
        es azucar sobre esto -> una sola fuente de verdad del lazo (DRY).
        """
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
                tools=tools.SCHEMAS,
                messages=messages,
            )
            usage["requests"] += 1
            if resp.usage:
                usage["input_tokens"] += resp.usage.input_tokens
                usage["output_tokens"] += resp.usage.output_tokens

            # Registrar el turno del modelo: su texto (razonamiento/redaccion) y
            # las tools que decide llamar.
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

            # stop_reason == "tool_use": ejecutar la(s) tool(s) y devolver resultados.
            messages.append({"role": "assistant", "content": resp.content})
            resultados = []
            for b in resp.content:
                if b.type != "tool_use":
                    continue
                fn = tools.DISPATCH.get(b.name)
                ts = time.perf_counter()
                try:
                    if fn is None:
                        raise ValueError(f"herramienta desconocida: {b.name}")
                    out = fn(**b.input)
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": out, "error": False,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    resultados.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": json.dumps(out, ensure_ascii=False),
                    })
                except Exception as e:  # el modelo vera el error y podra reaccionar
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": str(e), "error": True,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    resultados.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": f"Error: {e}",
                        "is_error": True,
                    })
            messages.append({"role": "user", "content": resultados})

        return {
            "pregunta": pregunta,
            "respuesta": respuesta,
            "modelo": self.model,
            "pasos": pasos,
            "usage": usage,
            "costo": costos.costo(usage, self.model),  # USD de esta consulta
            "ms_total": int((time.perf_counter() - t0) * 1000),
        }

    def preguntar(self, pregunta: str) -> str:
        """Responde una pregunta en lenguaje natural (solo el texto final)."""
        return self.conversar(pregunta)["respuesta"]

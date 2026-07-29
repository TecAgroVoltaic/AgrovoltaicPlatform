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

import anthropic

from pronostico import config
from pronostico.agent.prompts import SYSTEM_PROMPT
from pronostico.tools.forecast_tool import FORECAST_TOOL_SCHEMA, run_forecast


class ForecastAgent:
    """Orquestador conversacional sobre la herramienta `forecast`."""

    def __init__(self, client=None, model: str = config.MODEL):
        # anthropic.Anthropic() lee ANTHROPIC_API_KEY del entorno.
        self.client = client or anthropic.Anthropic()
        self.model = model

    def ask(self, pregunta: str) -> str:
        """Responde una pregunta en lenguaje natural (una vuelta de conversacion)."""
        messages = [{"role": "user", "content": pregunta}]
        while True:
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=config.MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=[FORECAST_TOOL_SCHEMA],
                messages=messages,
            )

            # El modelo se nego a responder.
            if resp.stop_reason == "refusal":
                return "No puedo responder a eso."

            # Respuesta final (texto): la devolvemos.
            if resp.stop_reason in ("end_turn", "max_tokens"):
                return "".join(b.text for b in resp.content if b.type == "text").strip()

            # Pausa del servidor (p.ej. tool del lado servidor): reintentar tal cual.
            if resp.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": resp.content})
                continue

            # stop_reason == "tool_use": ejecutar la(s) herramienta(s) y devolver resultados.
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for b in resp.content:
                if b.type == "tool_use":
                    try:
                        out = run_forecast(**b.input)
                        results.append({
                            "type": "tool_result",
                            "tool_use_id": b.id,
                            "content": json.dumps(out, ensure_ascii=False),
                        })
                    except Exception as e:  # el modelo vera el error y podra reaccionar
                        results.append({
                            "type": "tool_result",
                            "tool_use_id": b.id,
                            "content": f"Error: {e}",
                            "is_error": True,
                        })
            messages.append({"role": "user", "content": results})

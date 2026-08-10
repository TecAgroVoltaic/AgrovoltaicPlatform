"""Lazo conversacional del analizador (tool-use manual con el SDK de Anthropic).

El agente no sabe SQL ni fisica: solo orquesta. Manda la pregunta al modelo con las
tools disponibles; cuando el modelo llama una, el lazo la ejecuta (DISPATCH) y le
devuelve el JSON; el modelo redacta la respuesta final en espanol. Patron manual
(no el tool-runner beta) para control total y no filtrar el razonamiento interno.

Es GENERICO sobre el registro de tools: no hay logica de ninguna tool aqui.
"""
from __future__ import annotations

import json

import anthropic

from analizador import config, tools
from analizador.agent.prompts import SYSTEM_PROMPT


class Analizador:
    """Orquestador conversacional sobre el registro de tools de analisis."""

    def __init__(self, client=None, model: str = config.MODEL):
        # anthropic.Anthropic() lee ANTHROPIC_API_KEY del entorno.
        self.client = client or anthropic.Anthropic()
        self.model = model

    def preguntar(self, pregunta: str) -> str:
        """Responde una pregunta en lenguaje natural (una vuelta de conversacion)."""
        messages = [{"role": "user", "content": pregunta}]
        while True:
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=config.MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=tools.SCHEMAS,
                messages=messages,
            )

            if resp.stop_reason == "refusal":
                return "No puedo responder a eso."

            if resp.stop_reason in ("end_turn", "max_tokens"):
                return "".join(b.text for b in resp.content if b.type == "text").strip()

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
                try:
                    if fn is None:
                        raise ValueError(f"herramienta desconocida: {b.name}")
                    out = fn(**b.input)
                    resultados.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": json.dumps(out, ensure_ascii=False),
                    })
                except Exception as e:  # el modelo vera el error y podra reaccionar
                    resultados.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": f"Error: {e}",
                        "is_error": True,
                    })
            messages.append({"role": "user", "content": resultados})

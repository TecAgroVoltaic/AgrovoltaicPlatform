"""El lazo de `/preguntar`: una pregunta suelta, con la TRAZA completa para el debugger.

Corre el lazo tool-use y registra cada paso: los turnos del modelo (texto + tools
que pide) y cada ejecucion de tool (input, salida cruda, error, ms). El dict es
JSON-serializable tal cual.
"""
from __future__ import annotations

import time

from historico import config, costos, tools
from historico.agent import lazo
from historico.agent.prompts import SYSTEM_PROMPT

RESPUESTA_RECHAZO = "No puedo responder a eso."
FIN_DEL_TURNO = ("end_turn", "max_tokens")


def _texto_y_solicitudes(resp) -> tuple[str, list[dict]]:
    """El texto del turno (razonamiento/redaccion) y las tools que decide llamar."""
    texto = "".join(b.text for b in resp.content if b.type == "text").strip()
    solicita = [{"id": b.id, "nombre": b.name, "input": b.input}
                for b in resp.content if b.type == "tool_use"]
    return texto, solicita


def conversar(client, model: str, pregunta: str) -> dict:
    """Responde `pregunta` con `client`/`model` y devuelve la traza del lazo."""
    messages = [{"role": "user", "content": pregunta}]
    pasos: list[dict] = []
    usage = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
    t0 = time.perf_counter()
    respuesta = ""
    while True:
        resp = client.messages.create(
            model=model,
            max_tokens=config.MAX_TOKENS,
            system=SYSTEM_PROMPT,
            tools=tools.SCHEMAS,
            messages=messages,
        )
        usage["requests"] += 1
        if resp.usage:
            usage["input_tokens"] += resp.usage.input_tokens
            usage["output_tokens"] += resp.usage.output_tokens

        texto, solicita = _texto_y_solicitudes(resp)
        if texto or solicita:
            pasos.append({"tipo": "modelo", "texto": texto,
                          "solicita": solicita, "stop_reason": resp.stop_reason})

        if resp.stop_reason == "refusal":
            respuesta = RESPUESTA_RECHAZO
            break

        if resp.stop_reason in FIN_DEL_TURNO:
            respuesta = texto
            break

        if resp.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": resp.content})
            continue

        # stop_reason == "tool_use": ejecutar la(s) tool(s) y devolver resultados.
        messages.append({"role": "assistant", "content": resp.content})
        resultados = []
        for b in resp.content:
            if b.type == "tool_use":
                paso, resultado = lazo.ejecutar_tool(b)
                pasos.append(paso)
                resultados.append(resultado)
        messages.append({"role": "user", "content": resultados})

    return {
        "pregunta": pregunta,
        "respuesta": respuesta,
        "modelo": model,
        "pasos": pasos,
        "usage": usage,
        "costo": costos.costo(usage, model),  # USD de esta consulta
        "ms_total": int((time.perf_counter() - t0) * 1000),
    }

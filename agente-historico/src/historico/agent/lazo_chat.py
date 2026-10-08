"""El lazo del chat como eventos (contrato §3). Unica implementacion de `chat` y `chat_stream`.

Recibe el historial ya armado (`agent.Historico._historial`); aca solo se habla con
el modelo y se ejecutan las tools cliente. El system y las tools van con
`cache_control` (estaticos -> cacheados).
"""
from __future__ import annotations

import time
from typing import Iterator

from historico import config, costos, tools
from historico.agent import lazo
from historico.agent.lazo_preguntar import FIN_DEL_TURNO, RESPUESTA_RECHAZO
from historico.agent.prompts import CHAT_SYSTEM

# Web search del lado servidor (Anthropic la ejecuta). max_uses acota el gasto:
# cada busqueda tiene costo y mete ~miles de tokens de resultados -> pocas.
WEB_SEARCH = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}
_CACHE_EFIMERA = {"type": "ephemeral"}


def traza(model: str, respuesta: str, pasos: list[dict], usage: dict, t0: float) -> dict:
    """El cuerpo del evento `fin`: lo mismo que devuelve `Historico.chat`."""
    return {"respuesta": respuesta, "modelo": model, "pasos": pasos,
            "usage": usage, "costo": costos.costo(usage, model),
            "ms_total": int((time.perf_counter() - t0) * 1000)}


def _turno(client, en_vivo: bool, **kwargs):
    """Una llamada al modelo. En vivo emite los deltas de texto; devuelve el
    mensaje final (el mismo objeto que `messages.create`) via `yield from`."""
    if not en_vivo:
        return client.messages.create(**kwargs)
    with client.messages.stream(**kwargs) as stream:
        for evento in stream:
            if evento.type == "text" and evento.text:
                yield lazo.TEXTO, {"delta": evento.text}
        return stream.get_final_message()


def _herramientas() -> list[dict]:
    """Las tools cliente (la ultima marca el fin de la parte cacheada) + web search."""
    client_tools = [dict(s) for s in tools.SCHEMAS]
    client_tools[-1] = {**client_tools[-1], "cache_control": _CACHE_EFIMERA}
    return client_tools + [WEB_SEARCH]


def eventos(client, model: str, ms: list[dict], en_vivo: bool,
            t0: float) -> Iterator[tuple[str, dict]]:
    """Los eventos del lazo desde el primer turno hasta `fin` (sin `inicio`)."""
    system = [{"type": "text", "text": CHAT_SYSTEM, "cache_control": _CACHE_EFIMERA}]
    herramientas = _herramientas()
    pasos: list[dict] = []
    usage = lazo.uso_vacio()
    while True:
        resp = yield from _turno(client, en_vivo, model=model,
                                 max_tokens=config.MAX_TOKENS, system=system,
                                 tools=herramientas, messages=ms)
        lazo.sumar_uso(usage, resp.usage)
        texto, nuevos = lazo.pasos_del_turno(resp)
        for paso in nuevos:
            pasos.append(paso)
            yield lazo.PASO, paso

        if resp.stop_reason == "refusal":
            respuesta = RESPUESTA_RECHAZO
            break
        if resp.stop_reason in FIN_DEL_TURNO:
            respuesta = texto
            break
        ms.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason == "pause_turn":  # p.ej. web_search a mitad de turno
            continue

        # stop_reason == "tool_use": ejecutar las tools CLIENTE.
        resultados = []
        for b in resp.content:
            if b.type != "tool_use":
                continue
            yield lazo.TOOL_INICIO, {"id": b.id, "nombre": b.name, "input": b.input}
            paso, resultado = lazo.ejecutar_tool(b)
            pasos.append(paso)
            resultados.append(resultado)
            yield lazo.PASO, paso
        ms.append({"role": "user", "content": resultados})

    yield lazo.FIN, traza(model, respuesta, pasos, usage, t0)

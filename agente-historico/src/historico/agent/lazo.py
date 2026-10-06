"""Las piezas de un turno del lazo tool-use, compartidas por `/preguntar`, `/chat` y
`/chat/stream`. Sin estado: el que orquesta es `agent.Historico`.

Viven aparte porque las tres rutas tienen que hacer EXACTAMENTE lo mismo con una
tool (ejecutarla, registrar el paso, decidir que ve el modelo) y lo mismo con el uso
de tokens. Tres copias del mismo bloque son tres lugares donde una regla, como la de
las claves `_`, se aplica en uno y se olvida en otro.
"""
from __future__ import annotations

import json
import time

from historico import tools

# Eventos del lazo. Son los nombres del SSE de `/chat/stream` (contrato §3).
INICIO, TOOL_INICIO, PASO, TEXTO, FIN = "inicio", "tool_inicio", "paso", "texto", "fin"

# Prefijo de las claves de una salida que son para la INTERFAZ y no para el modelo.
PREFIJO_PRIVADO = "_"


def para_llm(salida):
    """Lo que viaja al modelo de la salida de una tool: sin las claves que empiezan
    con `_` (`_grafico`, `_descarga`). Son arreglos para dibujar o fichas para un
    boton; al modelo le cuestan tokens y no le dicen nada que no diga `resumen`.
    La salida completa se queda en `pasos`, que es de donde la toma la interfaz."""
    if not isinstance(salida, dict):
        return salida
    return {k: v for k, v in salida.items() if not k.startswith(PREFIJO_PRIVADO)}


def _ms_desde(inicio: float) -> int:
    return int((time.perf_counter() - inicio) * 1000)


def ejecutar_tool(bloque) -> tuple[dict, dict]:
    """Corre una tool pedida por el modelo. Devuelve (paso para la traza, tool_result).

    Un error de la tool NO corta el lazo: el modelo lo ve como `is_error` y puede
    corregir el parametro, que es el caso normal (variable mal escrita, fecha fuera).
    """
    inicio = time.perf_counter()
    paso = {"tipo": "tool", "nombre": bloque.name, "input": bloque.input}
    try:
        fn = tools.DISPATCH.get(bloque.name)
        if fn is None:
            raise ValueError(f"herramienta desconocida: {bloque.name}")
        salida = fn(**bloque.input)
    except Exception as exc:  # noqa: BLE001 — se le devuelve al modelo, no se calla
        paso.update(salida=str(exc), error=True, ms=_ms_desde(inicio))
        return paso, {"type": "tool_result", "tool_use_id": bloque.id,
                      "content": f"Error: {exc}", "is_error": True}
    paso.update(salida=salida, error=False, ms=_ms_desde(inicio))
    return paso, {"type": "tool_result", "tool_use_id": bloque.id,
                  "content": json.dumps(para_llm(salida), ensure_ascii=False, default=str)}


def uso_vacio() -> dict:
    return {"input_tokens": 0, "output_tokens": 0, "requests": 0,
            "cache_read": 0, "cache_write": 0, "web_searches": 0}


def sumar_uso(usage: dict, u) -> None:
    """Acumula el `usage` de una respuesta del SDK sobre el contador del turno."""
    usage["requests"] += 1
    if not u:
        return
    usage["input_tokens"] += u.input_tokens or 0
    usage["output_tokens"] += u.output_tokens or 0
    usage["cache_read"] += getattr(u, "cache_read_input_tokens", 0) or 0
    usage["cache_write"] += getattr(u, "cache_creation_input_tokens", 0) or 0
    servidor = getattr(u, "server_tool_use", None)
    if servidor:
        usage["web_searches"] += getattr(servidor, "web_search_requests", 0) or 0


def pasos_del_turno(resp) -> tuple[str, list[dict]]:
    """(texto del modelo, pasos que deja el turno): el del modelo y uno por busqueda web."""
    texto = "".join(b.text for b in resp.content if b.type == "text").strip()
    solicita = [{"id": b.id, "nombre": b.name, "input": b.input}
                for b in resp.content if b.type == "tool_use"]
    webs = [getattr(b, "input", {}).get("query") for b in resp.content
            if b.type == "server_tool_use"]
    pasos = []
    if texto or solicita or webs:
        pasos.append({"tipo": "modelo", "texto": texto, "solicita": solicita,
                      "stop_reason": resp.stop_reason})
    pasos += [{"tipo": "web", "query": w} for w in webs if w]
    return texto, pasos

"""Transporte SSE de `POST /chat/stream` (contrato §3). Solo formato y cierre.

El lazo (`agent.Historico.chat_stream`) produce eventos `(nombre, datos)`; aca se
serializan como `event:` + `data:` + linea en blanco, se registra el uso al llegar
`fin` (igual que `/chat`) y cualquier fallo se convierte en un evento `error` que
cierra el stream.

## Por que el error viaja como evento y no como status HTTP

Cuando el lazo falla, la respuesta ya salio con 200 y quiza con texto a medio
emitir: no hay status que cambiar. El evento `error` es la unica forma de que el
cliente distinga "termino" de "se corto". El mensaje es generico a proposito: el
detalle (que puede traer cuerpos de la API de Anthropic) va al log del servidor.
"""
from __future__ import annotations

import json
import logging
from typing import Callable, Iterator

import anthropic

from historico.agent.lazo import FIN

ERROR = "error"
MEDIA_TYPE = "text/event-stream"
# `X-Accel-Buffering: no` evita que un nginx delante junte el stream en un bloque.
CABECERAS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

CODIGO_LIMITE_LLM = "llm_limite"
CODIGO_LLM_NO_DISPONIBLE = "llm_no_disponible"
CODIGO_INTERNO = "error_interno"
_MENSAJES = {
    CODIGO_LIMITE_LLM: "El modelo esta saturado o se alcanzo su limite. Reintenta en unos segundos.",
    CODIGO_LLM_NO_DISPONIBLE: "No se pudo hablar con el modelo. Reintenta en unos segundos.",
    CODIGO_INTERNO: "Fallo interno del asistente. El detalle quedo registrado en el servidor.",
}

_log = logging.getLogger(__name__)


def formatear(evento: str, datos: dict) -> bytes:
    """Un evento SSE. `default=str` porque una tool puede devolver fechas."""
    cuerpo = json.dumps(datos, ensure_ascii=False, default=str)
    return f"event: {evento}\ndata: {cuerpo}\n\n".encode()


def codigo_de(exc: Exception) -> str:
    """Codigo estable del fallo, sin leer el texto del mensaje."""
    if isinstance(exc, anthropic.RateLimitError):
        return CODIGO_LIMITE_LLM
    if isinstance(exc, anthropic.APIError):
        return CODIGO_LLM_NO_DISPONIBLE
    return CODIGO_INTERNO


def emitir(eventos: Callable[[], Iterator[tuple[str, dict]]],
           registrar: Callable[[dict], None]) -> Iterator[bytes]:
    """Los bytes del stream. `eventos` es una fabrica para que un fallo al CREAR el
    lazo (p.ej. sin ANTHROPIC_API_KEY) tambien salga como evento `error`."""
    try:
        for evento, datos in eventos():
            if evento == FIN:
                try:
                    registrar(datos)
                except Exception:  # noqa: BLE001 — un fallo de disco no tumba la respuesta
                    _log.exception("no se pudo registrar el uso del chat")
            yield formatear(evento, datos)
    except Exception as exc:  # noqa: BLE001 — se informa al cliente y se registra
        _log.exception("fallo el chat en streaming")
        codigo = codigo_de(exc)
        yield formatear(ERROR, {"mensaje": _MENSAJES[codigo], "codigo": codigo})

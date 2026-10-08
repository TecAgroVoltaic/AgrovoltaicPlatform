"""Rutas conversacionales: el agente completo con traza, el chat y el consumo.

Patron "cerebro vs manos": aca SI corre el lazo LLM (para el debugger y el widget);
los numeros siguen saliendo de las tools. Las rutas que gastan tokens llevan el
freno de consumo como dependencia, visible en su firma.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from historico import limites, uso
from historico.rutas.dependencias import _frenar_consumo, _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])


class Pregunta(BaseModel):
    """Cuerpo de POST /preguntar."""

    pregunta: str


class ChatMsg(BaseModel):
    """Un turno del historial de chat (texto limpio)."""

    rol: str  # "user" | "assistant"
    texto: str


class ChatBody(BaseModel):
    """Cuerpo de POST /chat: historial + contexto de la vista."""

    mensajes: list[ChatMsg]
    contexto: str | None = None


def _fachada():
    """Los agentes se resuelven en `historico.api` en cada llamada, no al importar:
    `api._agente` y `api._asistente` son el punto de sustitucion que usan los tests
    y el debugger, y tiene que seguir funcionando aunque las rutas vivan aca."""
    from historico import api
    return api


def _registrar_uso(traza: dict) -> None:
    try:
        uso.registrar(traza)  # best-effort: un fallo de disco no debe tumbar la respuesta
    except Exception:  # noqa: BLE001
        pass


@router.post("/preguntar", dependencies=[Depends(_frenar_consumo)])
def preguntar(cuerpo: Pregunta) -> dict:
    """Corre el lazo LLM completo y devuelve la TRAZA (pasos + tools + respuesta + costo).

    Es la vista que consume el debugger: se ve que tool eligio el agente, con que
    parametros, la salida cruda de cada una, la respuesta final y el costo USD.
    `def` -> el lazo (I/O de red al LLM + DB) corre en el threadpool de FastAPI.

    La acumulacion de uso/costo se hace ACA (no en conversar()): el lazo del agente
    queda puro y el servicio es el que lleva la cuenta general."""
    traza = _fachada()._agente().conversar(cuerpo.pregunta)
    _registrar_uso(traza)
    return traza


@router.post("/chat", dependencies=[Depends(_frenar_consumo)])
def chat(cuerpo: ChatBody) -> dict:
    """Turno de CHAT multi-turno (para el widget). Recibe el historial de texto y el
    contexto de la vista; devuelve la respuesta + traza (tools/web) + costo."""
    traza = _fachada()._agente().chat([m.model_dump() for m in cuerpo.mensajes],
                                      cuerpo.contexto)
    _registrar_uso(traza)
    return traza


@router.post("/chat/stream", dependencies=[Depends(_frenar_consumo)])
def chat_stream(cuerpo: ChatBody) -> StreamingResponse:
    """El chat del asistente como SSE (contrato §3): pasos en vivo, deltas de texto y
    un `fin` identico a la respuesta de `/chat`. Ver `historico.chat_sse`."""
    from historico import chat_sse
    mensajes = [m.model_dump() for m in cuerpo.mensajes]
    asistente = _fachada()._asistente
    return StreamingResponse(
        chat_sse.emitir(lambda: asistente().chat_stream(mensajes, cuerpo.contexto),
                        uso.registrar),
        media_type=chat_sse.MEDIA_TYPE, headers=chat_sse.CABECERAS,
    )


@router.get("/uso")
def consumo() -> dict:
    """Consumo acumulado del agente (tokens + costo USD + nº consultas, por modelo).

    Incluye el estado del tope diario: de nada sirve saber cuanto se gasto si no
    se ve contra que se compara.
    """
    agotado, gastado, tope = limites.presupuesto_agotado()
    return {**uso.resumen(),
            "hoy": {"usd": round(gastado, 6), "tope_usd": tope, "agotado": agotado}}

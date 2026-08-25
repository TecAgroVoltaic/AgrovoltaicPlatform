"""API HTTP del Historico — expone cada tool atomica como endpoint para VisioneFlow.

Patron "cerebro vs manos" (igual que el forecaster): el LLM lo orquesta el nodo
`aiAgent` de VisioneFlow; los numeros salen de AQUI. Cada tool atomica es un endpoint
`POST /tool/<nombre>`, que se cablea como una instancia del nodo generico
`httpRequestTool`. Transporte puro: valida en el borde, delega en la tool, responde
su dict (ya JSON-serializable).

Seguridad: si HISTORICO_API_KEY esta en el entorno, /tool exige el header
`x-api-key` (comparacion en tiempo constante). /health y /tools quedan abiertos.
"""
from __future__ import annotations

import os
import secrets

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel

from historico import datos, tools, uso

ENV_API_KEY = "HISTORICO_API_KEY"
# Nombre anterior. Se sigue leyendo porque el contenedor desplegado tiene el viejo
# en su entorno, y aca la ausencia de clave no falla: DESACTIVA la verificacion.
# O sea que un renombre sin respaldo no rompe el servicio, lo deja abierto.
ENV_API_KEY_PREVIO = "ANALIZADOR_API_KEY"

app = FastAPI(
    title="agente Historico San Carlos",
    description="Tools de analisis del historico fotovoltaico como endpoints HTTP.",
    version="1.1.0",
)

# Agente perezoso: solo se construye al primer /preguntar (anthropic.Anthropic()
# exige ANTHROPIC_API_KEY al crear el cliente; /health y /tool no deben depender
# de esa clave). Se cachea para no releer el entorno en cada request.
_AGENTE = None


def _agente():
    global _AGENTE
    if _AGENTE is None:
        from historico.agent.agent import Historico
        _AGENTE = Historico()
    return _AGENTE


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


def _verificar_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Exige la API key SOLO si esta configurada. Comparacion en tiempo constante."""
    esperada = os.environ.get(ENV_API_KEY) or os.environ.get(ENV_API_KEY_PREVIO)
    if not esperada:
        return
    if not secrets.compare_digest(esperada, x_api_key or ""):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="API key invalida")


@app.get("/health")
def health() -> dict:
    """Ping para monitoreo. No toca datos ni exige clave."""
    return {"status": "ok", "tools": [s["name"] for s in tools.SCHEMAS]}


@app.get("/tools")
def listar_tools() -> dict:
    """Esquemas de las tools (para configurar los httpRequestTool en VisioneFlow)."""
    return {"tools": tools.SCHEMAS}


@app.post("/tool/{nombre}", dependencies=[Depends(_verificar_api_key)])
def ejecutar_tool(nombre: str, params: dict = Body(default={})) -> dict:
    """Ejecuta la tool `nombre` con el body JSON como parametros. `def` -> threadpool
    (las tools hacen I/O de DB sincrono)."""
    fn = tools.DISPATCH.get(nombre)
    if fn is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"tool desconocida: {nombre!r} ({', '.join(tools.DISPATCH)})",
        )
    try:
        return fn(**(params or {}))
    except TypeError as exc:  # parametro invalido -> culpa del cliente
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ── Agente completo (con TRAZA) — para el debugger ────────────────────────────
@app.post("/preguntar", dependencies=[Depends(_verificar_api_key)])
def preguntar(cuerpo: Pregunta) -> dict:
    """Corre el lazo LLM completo y devuelve la TRAZA (pasos + tools + respuesta + costo).

    Es la vista que consume el debugger: se ve que tool eligio el agente, con que
    parametros, la salida cruda de cada una, la respuesta final y el costo USD.
    `def` -> el lazo (I/O de red al LLM + DB) corre en el threadpool de FastAPI.

    La acumulacion de uso/costo se hace ACA (no en conversar()): el lazo del agente
    queda puro y el servicio es el que lleva la cuenta general."""
    traza = _agente().conversar(cuerpo.pregunta)
    try:
        uso.registrar(traza)  # best-effort: un fallo de disco no debe tumbar la respuesta
    except Exception:
        pass
    return traza


@app.post("/chat", dependencies=[Depends(_verificar_api_key)])
def chat(cuerpo: ChatBody) -> dict:
    """Turno de CHAT multi-turno (para el widget). Recibe el historial de texto y el
    contexto de la vista; devuelve la respuesta + traza (tools/web) + costo."""
    traza = _agente().chat([m.model_dump() for m in cuerpo.mensajes], cuerpo.contexto)
    try:
        uso.registrar(traza)
    except Exception:
        pass
    return traza


@app.get("/uso", dependencies=[Depends(_verificar_api_key)])
def consumo() -> dict:
    """Consumo acumulado del agente (tokens + costo USD + nº consultas, por modelo)."""
    return uso.resumen()


# ── Peek de datos read-only — para cruzar lo que el agente calculo ────────────
@app.get("/datos/tablas", dependencies=[Depends(_verificar_api_key)])
def datos_tablas() -> dict:
    """Panorama de cobertura de todas las relaciones (conteo + rango temporal)."""
    return datos.tablas()


@app.get("/datos/columnas", dependencies=[Depends(_verificar_api_key)])
def datos_columnas(tabla: str = Query(...)) -> dict:
    """Esquema (columnas + tipos) de una relacion de la allowlist."""
    try:
        return datos.columnas(tabla)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/datos/muestra", dependencies=[Depends(_verificar_api_key)])
def datos_muestra(tabla: str = Query(...), limit: int = Query(20),
                  orden: str = Query("desc")) -> dict:
    """Ultimas/primeras filas crudas de una relacion (allowlist)."""
    try:
        return datos.muestra(tabla, limit, orden)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/datos/serie", dependencies=[Depends(_verificar_api_key)])
def datos_serie(tabla: str = Query(...), columna: str = Query(...),
                bucket: str = Query("day"), agg: str = Query("avg"),
                desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Serie temporal agregada (para graficar) de una columna de la allowlist."""
    try:
        return datos.serie(tabla, columna, bucket, agg, desde, hasta)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ── Arquitectura y calidad ───────────────────────────────────────────────────
# /arquitectura va SIN clave, igual que /health y /tools: es la descripcion del
# agente, no sus datos. Que se pueda leer sin credencial es el punto (la consola
# la dibuja), y no expone ni una lectura del sistema.
@app.get("/arquitectura")
def arquitectura_agente() -> dict:
    """El agente como estructura, derivado de las tools reales. Ver arquitectura.py."""
    from historico.arquitectura import mapa
    return mapa()


# Los tres de abajo son lecturas directas del store para las VISTAS de la consola.
# No son tools: una tool esta redactada para que un LLM la elija y devuelve lo
# justo; una vista necesita el detalle completo y paginado. Mezclarlas obligaria
# a que la descripcion que lee el modelo hable de paginacion, que no le importa.
@app.get("/calidad/resumen", dependencies=[Depends(_verificar_api_key)])
def calidad_resumen(desde: str | None = Query(None),
                    hasta: str | None = Query(None)) -> dict:
    """Cobertura, cielo y conteo de hallazgos por tipo. La cabecera de la vista."""
    from historico.tools import calidad_periodo, cielo_periodo
    return {
        "calidad": calidad_periodo.run(desde, hasta),
        "cielo": cielo_periodo.run(desde, hasta),
    }


@app.get("/calidad/dias", dependencies=[Depends(_verificar_api_key)])
def calidad_dias(desde: str | None = Query(None),
                 hasta: str | None = Query(None)) -> dict:
    """Un renglon por dia de CALENDARIO con su veredicto, para el mapa de dias."""
    from historico.calidad import contexto
    from historico.periodo import rango
    d, h = rango(desde, hasta)
    return {"periodo": {"desde": d, "hasta": h}, "dias": contexto.dias(d, h)}


@app.get("/calidad/hallazgos", dependencies=[Depends(_verificar_api_key)])
def calidad_hallazgos(fecha: str | None = Query(None), tipo: str | None = Query(None),
                      severidad: str | None = Query(None), variable: str | None = Query(None),
                      desde: str | None = Query(None), hasta: str | None = Query(None),
                      limite: int = Query(50, ge=1, le=200)) -> dict:
    """El detalle. `fecha` es un atajo para pedir un solo dia."""
    from datetime import date, timedelta

    from historico.tools import hallazgos
    if fecha:
        try:
            d0 = date.fromisoformat(fecha)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"fecha invalida: {fecha!r}") from exc
        desde, hasta = d0.isoformat(), (d0 + timedelta(days=1)).isoformat()
    return hallazgos.run(desde, hasta, tipo, severidad, variable, limite)

"""API HTTP del analizador — expone cada tool atomica como endpoint para VisioneFlow.

Patron "cerebro vs manos" (igual que el forecaster): el LLM lo orquesta el nodo
`aiAgent` de VisioneFlow; los numeros salen de AQUI. Cada tool atomica es un endpoint
`POST /tool/<nombre>`, que se cablea como una instancia del nodo generico
`httpRequestTool`. Transporte puro: valida en el borde, delega en la tool, responde
su dict (ya JSON-serializable).

Seguridad: si ANALIZADOR_API_KEY esta en el entorno, /tool exige el header
`x-api-key` (comparacion en tiempo constante). /health y /tools quedan abiertos.
"""
from __future__ import annotations

import os
import secrets

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel

from analizador import datos, tools, uso

ENV_API_KEY = "ANALIZADOR_API_KEY"

app = FastAPI(
    title="Analizador PV San Carlos",
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
        from analizador.agent.agent import Analizador
        _AGENTE = Analizador()
    return _AGENTE


class Pregunta(BaseModel):
    """Cuerpo de POST /preguntar."""

    pregunta: str


def _verificar_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Exige la API key SOLO si esta configurada. Comparacion en tiempo constante."""
    esperada = os.environ.get(ENV_API_KEY)
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

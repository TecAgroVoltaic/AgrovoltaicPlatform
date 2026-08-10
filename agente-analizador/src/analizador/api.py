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

from fastapi import Body, Depends, FastAPI, Header, HTTPException, status

from analizador import tools

ENV_API_KEY = "ANALIZADOR_API_KEY"

app = FastAPI(
    title="Analizador PV San Carlos",
    description="Tools de analisis del historico fotovoltaico como endpoints HTTP.",
    version="1.0.0",
)


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

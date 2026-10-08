"""Rutas de descubrimiento: salud, catalogo de tools, ejecucion de una tool y arquitectura.

Cada tool atomica es un endpoint `POST /tool/<nombre>`, que se cablea como una
instancia del nodo generico `httpRequestTool` de VisioneFlow.
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status

from historico import errores, tools
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Ping para monitoreo. No toca datos ni exige clave."""
    return {"status": "ok", "tools": [s["name"] for s in tools.SCHEMAS]}


@router.get("/tools")
def listar_tools() -> dict:
    """Esquemas de las tools (para configurar los httpRequestTool en VisioneFlow)."""
    return {"tools": tools.SCHEMAS}


@router.post("/tool/{nombre}", dependencies=[Depends(_verificar_api_key)])
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
    except TypeError as exc:
        # Parametro que la tool no acepta: es el mismo caso que un ValueError (quien
        # llamo se equivoco), asi que se traduce para que lo atienda el manejador
        # compartido y responda con `codigo` como todos los demas.
        raise errores.ParametroInvalido(str(exc)) from exc


# /arquitectura va SIN clave, igual que /health y /tools: es la descripcion del
# agente, no sus datos. Que se pueda leer sin credencial es el punto (la consola
# la dibuja), y no expone ni una lectura del sistema.
@router.get("/arquitectura")
def arquitectura_agente() -> dict:
    """El agente como estructura, derivado de las tools reales. Ver arquitectura.py."""
    from historico.arquitectura import mapa
    return mapa()

"""Rutas de descubrimiento: salud, catalogo de tools, ejecucion de una tool y arquitectura.

Cada tool atomica es un endpoint `POST /tool/<nombre>`, que se cablea como una
instancia del nodo generico `httpRequestTool` de VisioneFlow.
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from historico import errores, tools, uso
from historico.agent import fallas, notificar
from historico.rutas.dependencias import _canal, _frenar_tool, _verificar_api_key

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Ping para monitoreo. No toca datos ni exige clave."""
    return {"status": "ok", "tools": [s["name"] for s in tools.SCHEMAS]}


@router.get("/tools")
def listar_tools() -> dict:
    """Esquemas de las tools (para configurar los httpRequestTool en VisioneFlow)."""
    return {"tools": tools.SCHEMAS}


@router.post("/tool/{nombre}", dependencies=[Depends(_verificar_api_key), Depends(_frenar_tool)])
def ejecutar_tool(nombre: str, params: dict = Body(default={}),
                  canal: str = Depends(_canal)) -> dict:
    """Ejecuta la tool `nombre` con el body JSON como parametros. `def` -> threadpool
    (las tools hacen I/O de DB sincrono)."""
    fn = tools.DISPATCH.get(nombre)
    if fn is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"tool desconocida: {nombre!r} ({', '.join(tools.DISPATCH)})",
        )
    try:
        salida = fn(**(params or {}))
    except Exception as exc:  # noqa: BLE001 — sale como `falla`, igual que en el lazo
        _contar(canal, error=True)
        return _respuesta_falla(exc, nombre, canal)
    _contar(canal, error=False)
    return salida


def _contar(canal: str, error: bool) -> None:
    try:
        uso.registrar_tool(canal, error)  # best-effort: el disco no tumba la respuesta
    except Exception:  # noqa: BLE001
        pass


def _respuesta_falla(exc: Exception, nombre: str, canal: str) -> JSONResponse:
    """La misma `falla` que ve el modelo en el chat (`agent.lazo.ejecutar_tool`).

    Va dos veces a proposito: `falla` la lee el modelo de Visione Flow y `_falla`
    (clave `_`) Flow la reenvia a la consola sin pasarla por el modelo. El reporte
    usa la misma regla que el lazo (`notificar`: una alerta por causa cada 10 min);
    el canal viaja en el reporte pero NO en la clave, para que una caida de AgroDash
    siga siendo una sola causa la vea el chat o la vea Flow.

    Estado: un error de parametro conserva el 4xx y el `codigo` del manejador
    compartido (`errores.traducir`); un `TypeError` o `KeyError` (el mismo tipo en
    `fallas`) sale como `parametro_invalido`. Lo demas sigue saliendo 500, como
    antes, ahora con cuerpo legible.
    """
    falla = fallas.describir(exc, nombre)
    reportar = falla.pop("reportar")
    falla["reportada"] = notificar.reportar({**falla, "canal": canal}) if reportar else False
    cuerpo = {"error": falla["detalle"], "falla": falla, "_falla": falla}
    if falla["tipo"] == fallas.PARAMETRO:
        param = exc if isinstance(exc, ValueError) else errores.ParametroInvalido(str(exc))
        estado, extra = errores.traducir(param)
        return JSONResponse(status_code=estado, content={**extra, **cuerpo})
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        content={"detail": falla["detalle"], **cuerpo})


# /arquitectura va SIN clave, igual que /health y /tools: es la descripcion del
# agente, no sus datos. Que se pueda leer sin credencial es el punto (la consola
# la dibuja), y no expone ni una lectura del sistema.
@router.get("/arquitectura")
def arquitectura_agente() -> dict:
    """El agente como estructura, derivado de las tools reales. Ver arquitectura.py."""
    from historico.arquitectura import mapa
    return mapa()

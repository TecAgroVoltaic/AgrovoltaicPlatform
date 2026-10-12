"""Exportacion compuesta por PlanExportacion (contrato §3): estimar y descargar.

Los errores del plan (`PlanInvalido`, un `ValueError` con `codigo`) los traduce el
manejador comun a 400 con su codigo. AgroDash o la base sin responder -> 503.
Comparte el semaforo de descargas simultaneas de `/datos/exportar`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from historico import plan as plan_mod
from historico.rutas import exportacion
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])


def _no_disponible(exc: RuntimeError) -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.get(plan_mod.RUTA_ESTIMAR)
def datos_exportar_plan_estimar(p: str = Query(...)) -> dict:
    """Filas por archivo y total, si hace falta confirmar y el tope duro."""
    try:
        return plan_mod.estimar(plan_mod.desde_url(p))
    except RuntimeError as exc:
        raise _no_disponible(exc) from exc


def _elegir(plan: plan_mod.Plan, archivo: int | None, zip_: bool):
    if zip_:
        return plan_mod.zip_(plan, f"datos_{plan.desde}_{plan.hasta}")
    if archivo is None:
        if len(plan.archivos) != 1:
            raise plan_mod.PlanInvalido("archivo_requerido",
                                        "el plan tiene varios archivos: pide 'archivo=<indice>' o 'zip=1'")
        archivo = 0
    if not 0 <= archivo < len(plan.archivos):
        raise plan_mod.PlanInvalido("archivo_inexistente",
                                    f"archivo {archivo} no existe (el plan tiene {len(plan.archivos)})")
    return plan_mod.archivo(plan, archivo)


@router.get(plan_mod.RUTA)
def datos_exportar_plan(p: str = Query(...), archivo: int | None = Query(None),
                        zip: int = Query(0)) -> StreamingResponse:  # noqa: A002 — nombre del contrato
    """Un archivo del plan (`archivo=<indice>`) o todos en un zip (`zip=1`), en streaming.
    Se valida y se estima ANTES de emitir: un plan sobre el tope no empieza a bajar."""
    plan = plan_mod.desde_url(p)
    if not exportacion._exportaciones.acquire(blocking=False):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"ya hay {exportacion.MAX_EXPORTACIONES} descargas en curso: "
                                   f"espera a que terminen")
    try:
        plan_mod.estimar(plan)
        ex = _elegir(plan, archivo, bool(zip))
    except RuntimeError as exc:
        exportacion._exportaciones.release()
        raise _no_disponible(exc) from exc
    except Exception:
        exportacion._exportaciones.release()
        raise
    return StreamingResponse(
        exportacion._con_cupo(ex.cuerpo), media_type=ex.content_type,
        headers={"Content-Disposition": f'attachment; filename="{ex.nombre}"'},
    )

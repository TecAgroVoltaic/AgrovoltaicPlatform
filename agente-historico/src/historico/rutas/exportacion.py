"""Exportacion por rango de fechas (csv / dat / mat): la descarga para el humano.

Los errores de `historico.exportar` se traducen aca y no en el manejador comun
porque tienen codigos propios: 413 si es muy grande y 503 si la fuente no esta
configurada.
"""
from __future__ import annotations

import os
import threading

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from historico import exportar
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])

# Descargas simultaneas: cada una ocupa un hilo del threadpool mientras dura (y, via
# API, hasta PARALELO llamadas a AgroDash). Un tope evita que clics repetidos agoten
# el servicio para todos. Se libera al terminar de emitir (o al cortar el cliente).
MAX_EXPORTACIONES = int(os.environ.get("MAX_EXPORTACIONES", "3"))
_exportaciones = threading.BoundedSemaphore(MAX_EXPORTACIONES)


def _lista_csv(csv_: str | None) -> list[str] | None:
    return [c.strip() for c in csv_.split(",") if c.strip()] if csv_ else None


def _filtros_exportar(caja: str | None, sensor_tipo: str | None) -> dict[str, list[str]]:
    """Filtros opcionales (solo los datasets que los declaran los aceptan)."""
    out: dict[str, list[str]] = {}
    if caja:
        out["caja"] = _lista_csv(caja) or []
    if sensor_tipo:
        out["sensor_tipo"] = _lista_csv(sensor_tipo) or []
    return out


def _http_exportar(exc: Exception) -> HTTPException:
    """Traduce los errores de exportar.py a codigos: 400 cliente, 413 muy grande,
    503 fuente sin configurar (RuntimeError de config)."""
    if isinstance(exc, exportar.ExportacionDemasiadoGrande):
        return HTTPException(413, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, RuntimeError):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    raise exc


def _con_cupo(cuerpo):
    """Envuelve el iterador de bytes para devolver el cupo cuando se agota o se cierra."""
    try:
        yield from cuerpo
    finally:
        _exportaciones.release()


@router.get("/datos/exportables")
def datos_exportables() -> dict:
    """Que se puede exportar, por fuente: datasets, columnas reales, cobertura, filtros."""
    return exportar.catalogo()


@router.get("/datos/exportar/estimar")
def datos_exportar_estimar(tabla: str = Query(...), desde: str | None = Query(None),
                           hasta: str | None = Query(None), fuente: str = Query("supabase"),
                           caja: str | None = Query(None), sensor_tipo: str | None = Query(None),
                           paso: int = Query(0)) -> dict:
    """Cuantas filas caeran en el rango (para avisar antes de descargar)."""
    try:
        return exportar.estimar(tabla, desde, hasta, fuente, _filtros_exportar(caja, sensor_tipo), paso)
    except Exception as exc:  # noqa: BLE001
        raise _http_exportar(exc) from exc


@router.get("/datos/exportar/previa")
def datos_exportar_previa(tabla: str = Query(...), desde: str | None = Query(None),
                          hasta: str | None = Query(None), columnas: str | None = Query(None),
                          fuente: str = Query("supabase"), caja: str | None = Query(None),
                          sensor_tipo: str | None = Query(None), n: int = Query(8),
                          paso: int = Query(0)) -> dict:
    """Primeras filas del rango, tal como saldran en el archivo (vista previa)."""
    try:
        return exportar.previa(tabla, desde, hasta, _lista_csv(columnas), fuente,
                               _filtros_exportar(caja, sensor_tipo), n, paso)
    except Exception as exc:  # noqa: BLE001
        raise _http_exportar(exc) from exc


@router.get("/datos/exportar")
def datos_exportar(tabla: str = Query(...), formato: str = Query("csv"),
                   desde: str | None = Query(None), hasta: str | None = Query(None),
                   columnas: str | None = Query(None), fuente: str = Query("supabase"),
                   caja: str | None = Query(None), sensor_tipo: str | None = Query(None),
                   paso: int = Query(0)) -> StreamingResponse:
    """Descarga el rango [desde, hasta] de un dataset como archivo adjunto.

    `columnas`, `caja` y `sensor_tipo` son listas separadas por comas (opcionales);
    `paso` (seg, solo AgroDash) es el ancho del bucket: 0 = crudo.
    El cuerpo se emite por lotes: la respuesta empieza antes de leer todo. `def` ->
    threadpool (la lectura en streaming es I/O sincrono)."""
    if not _exportaciones.acquire(blocking=False):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"ya hay {MAX_EXPORTACIONES} descargas en curso: espera a que terminen")
    try:
        ex = exportar.exportar(tabla, formato, desde, hasta, _lista_csv(columnas), fuente,
                               _filtros_exportar(caja, sensor_tipo), paso)
    except Exception as exc:  # noqa: BLE001
        _exportaciones.release()
        raise _http_exportar(exc) from exc
    return StreamingResponse(
        _con_cupo(ex.cuerpo), media_type=ex.content_type,
        headers={"Content-Disposition": f'attachment; filename="{ex.nombre}"'},
    )

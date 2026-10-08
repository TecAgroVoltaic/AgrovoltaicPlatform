"""Peek de datos read-only, para cruzar lo que el agente calculo.

Sin `try/except`: una tabla o columna fuera de la allowlist levanta ValueError y el
manejador compartido lo traduce a 400 con `codigo`, igual que en el resto de la
API. Tres bloques identicos eran tres lugares donde el codigo podia faltar.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from historico import datos
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])


@router.get("/datos/tablas")
def datos_tablas() -> dict:
    """Panorama de cobertura de todas las relaciones (conteo + rango temporal)."""
    return datos.tablas()


@router.get("/datos/columnas")
def datos_columnas(tabla: str = Query(...)) -> dict:
    """Esquema (columnas + tipos) de una relacion de la allowlist."""
    return datos.columnas(tabla)


@router.get("/datos/muestra")
def datos_muestra(tabla: str = Query(...), limit: int = Query(20),
                  orden: str = Query("desc")) -> dict:
    """Ultimas/primeras filas crudas de una relacion (allowlist)."""
    return datos.muestra(tabla, limit, orden)


@router.get("/datos/serie")
def datos_serie(tabla: str = Query(...), columna: str = Query(...),
                bucket: str = Query("day"), agg: str = Query("avg"),
                desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Serie temporal agregada (para graficar) de una columna de la allowlist."""
    return datos.serie(tabla, columna, bucket, agg, desde, hasta)

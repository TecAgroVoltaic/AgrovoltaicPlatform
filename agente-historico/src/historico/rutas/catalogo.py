"""`GET /datos/catalogo`: el catalogo unificado de variables de las cuatro fuentes (§2).

No reemplaza `/analitica/variables` (lo que se puede GRAFICAR del PV): esto es lo que
se puede EXPORTAR o combinar, con id `"<SourceId>:<clave>"` y etiqueta legible.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from historico import catalogo_datos
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])


@router.get("/datos/catalogo")
def datos_catalogo(consulta: str | None = Query(None),
                   fuentes: str | None = Query(None)) -> dict:
    """`{version, grupos:[{fuente, grupo, etiqueta, variables:[...]}]}`. `consulta` y
    `fuentes` (lista separada por comas) filtran; sin ellos sale todo."""
    lista = [f.strip() for f in fuentes.split(",") if f.strip()] if fuentes else None
    return catalogo_datos.catalogo(consulta, lista)

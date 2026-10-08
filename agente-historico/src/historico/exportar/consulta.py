"""Lectura de filas por la via del dataset: SQL parametrizado (db.py) o API (AgroDash)."""
from __future__ import annotations

from typing import Iterator

from historico import agrodash_api, db
from historico.exportar.modelo import Columna, Dataset
from historico.exportar.reloj import _rango_api, rango
from historico.exportar.resolucion import _filtros


def _lista_select(sel: list[Columna]) -> str:
    return ", ".join(c.expr if c.expr == c.nombre else f"{c.expr} AS {c.nombre}" for c in sel)


def _consulta(ds: Dataset, sel: list[Columna], desde: str | None, hasta: str | None,
              filtros: dict[str, list[str]] | None, limite: int | None = None
              ) -> tuple[str, tuple, str, str]:
    """SQL + params + etiquetas de rango. Nombres/expresiones ya validados (catalogo)."""
    clausulas, params = _filtros(ds, filtros)
    ed = eh = "completo"
    if ds.tcol:
        d, h, ed, eh = rango(desde, hasta, ds)
        clausulas = [f"{ds.tcol} >= %s", f"{ds.tcol} < %s"] + clausulas
        params = [d, h] + params
    sql = f"SELECT {_lista_select(sel)} FROM {ds.origen}"
    if clausulas:
        sql += " WHERE " + " AND ".join(clausulas)
    if ds.tcol:
        sql += f" ORDER BY {ds.tcol}"
    if limite:
        sql += " LIMIT %s"
        params.append(int(limite))
    return sql, tuple(params), ed, eh


def _filas(ds: Dataset, sel: list[Columna], desde: str | None, hasta: str | None,
           filtros: dict[str, list[str]] | None, paso: int, limite: int | None = None
           ) -> tuple[Iterator[tuple], str, str]:
    """Iterador de filas crudas (tuplas en el orden de `sel`) + etiquetas de rango,
    por la via del dataset: SQL (`db.en_streaming`) o API (buckets por sensor)."""
    nombres = [c.nombre for c in sel]
    if ds.via == "api":
        _filtros(ds, filtros)                      # valida nombres de filtro
        if not ds.tcol:
            return agrodash_api.filas_sensores(nombres, filtros), "completo", "completo"
        d, h, ed, eh = _rango_api(desde, hasta)
        return agrodash_api.filas(nombres, d, h, filtros, paso, limite), ed, eh
    sql, params, ed, eh = _consulta(ds, sel, desde, hasta, filtros, limite)
    return db.en_streaming(sql, params), ed, eh

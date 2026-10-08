"""Antes de descargar: cuantas filas caeran en el rango y una vista previa de las primeras."""
from __future__ import annotations

from historico import agrodash_api, db
from historico.exportar.consulta import _filas
from historico.exportar.modelo import MAX_FILAS_MAT, Dataset
from historico.exportar.reloj import _expr_local, _rango_api, rango
from historico.exportar.resolucion import _ds, _filtros, _paso, _seleccion
from historico.exportar.texto import _celda_csv

_SEG_POR_LECTURA_CRUDA = 60   # heuristica: ~1 lectura/min por sensor en crudo
_MAX_FILAS_PREVIA = 50


def _estimar_api(ds: Dataset, base: dict, desde: str | None, hasta: str | None,
                 filtros: dict[str, list[str]] | None, paso: int | None) -> dict:
    n_sens = len(agrodash_api.sensores(filtros))
    if not ds.tcol:
        return {**base, "filas": n_sens, "primero": None, "ultimo": None, "desde": None, "hasta": None}
    p = _paso(ds, paso)
    d, h, ed, eh = _rango_api(desde, hasta)
    sens = agrodash_api.sensores(filtros)
    rango_etiquetas = {"sensores": n_sens, "primero": None, "ultimo": None, "desde": ed, "hasta": eh}
    if n_sens <= agrodash_api.MAX_SENSORES_CONTEO:
        # Conteo EXACTO: una llamada gruesa por sensor (en paralelo) suma las lecturas.
        ns = agrodash_api.conteos(sens, d, h)
        if not p:
            return {**base, "filas": sum(ns), "cota": False, **rango_etiquetas}
        intervalos = max(1, int((h - d).total_seconds() // p))
        return {**base, "filas": sum(min(n_, intervalos) for n_ in ns), "cota": True, **rango_etiquetas}
    intervalos = max(1, int((h - d).total_seconds() // (p or _SEG_POR_LECTURA_CRUDA)))
    return {**base, "filas": n_sens * intervalos, "cota": True, **rango_etiquetas}


def _estimar_sql(ds: Dataset, base: dict, desde: str | None, hasta: str | None,
                 clausulas: list[str], params: list) -> dict:
    if not ds.tcol:
        where = (" WHERE " + " AND ".join(clausulas)) if clausulas else ""
        r = db.uno(f"SELECT count(*) AS n FROM {ds.origen}{where}", tuple(params))
        return {**base, "filas": r.get("n", 0), "primero": None, "ultimo": None,
                "desde": None, "hasta": None}
    d, h, ed, eh = rango(desde, hasta, ds)
    expr, p_expr = _expr_local(ds)
    where = " AND ".join([f"{ds.tcol} >= %s", f"{ds.tcol} < %s"] + clausulas)
    r = db.uno(
        f"SELECT count(*) AS n, min({expr})::text AS mn, max({expr})::text AS mx "
        f"FROM {ds.origen} WHERE {where}",
        tuple(p_expr + p_expr + [d, h] + params),
    )
    return {**base, "filas": r.get("n", 0), "primero": r.get("mn"), "ultimo": r.get("mx"),
            "desde": ed, "hasta": eh}


def estimar(tabla: str, desde: str | None, hasta: str | None,
            fuente: str = "supabase", filtros: dict[str, list[str]] | None = None,
            paso: int | None = None) -> dict:
    """Cuantas filas caeran en el rango (y primer/ultimo dato), antes de descargar.
    Via API: con <= MAX_SENSORES_CONTEO sensores el conteo es EXACTO (una llamada gruesa por
    sensor suma `n`); en crudo `cota: false`, con paso es `min(lecturas, intervalos)` por sensor
    (`cota: true`). Con mas sensores, heuristica sensores × intervalos (`cota: true`)."""
    ds = _ds(fuente, tabla)
    clausulas, params = _filtros(ds, filtros)
    base = {"fuente": fuente, "tabla": tabla, "relacion": ds.relacion or ds.origen,
            "max_filas_mat": MAX_FILAS_MAT, "cota": False}
    if ds.via == "api":
        return _estimar_api(ds, base, desde, hasta, filtros, paso)
    return _estimar_sql(ds, base, desde, hasta, clausulas, params)


def previa(tabla: str, desde: str | None, hasta: str | None, columnas: list[str] | None = None,
           fuente: str = "supabase", filtros: dict[str, list[str]] | None = None, n: int = 8,
           paso: int | None = None) -> dict:
    """Primeras `n` filas del rango, ya serializadas como en el CSV (para mostrar antes de bajar)."""
    ds = _ds(fuente, tabla)
    sel = _seleccion(ds, columnas)
    lim = max(1, min(int(n), _MAX_FILAS_PREVIA))
    it, _, _ = _filas(ds, sel, desde, hasta, filtros, _paso(ds, paso), limite=lim)
    filas: list[list[str]] = []
    for fila in it:
        filas.append([_celda_csv(v, ds.reloj) for v in fila])
        if len(filas) >= lim:
            break
    return {"fuente": fuente, "tabla": tabla, "columnas": [c.nombre for c in sel], "filas": filas}

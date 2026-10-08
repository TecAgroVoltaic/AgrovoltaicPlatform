"""Panorama de cobertura, esquema y muestra cruda de una relacion de la allowlist."""
from __future__ import annotations

from historico import db
from historico.datos.relaciones import RELACIONES, _columnas, _rel

_LIMITE_MAX = 500


def tablas() -> dict:
    """Panorama de cobertura: por cada relacion, conteo de filas y rango temporal.

    UNA sola consulta (UNION ALL) en vez de N -> un unico round-trip a la DB. Los
    nombres salen de la allowlist (no del cliente), por eso son seguros de interpolar."""
    partes = []
    for clave, (rel, tcol) in RELACIONES.items():
        col = tcol if tcol else "NULL"
        partes.append(
            f"SELECT '{clave}' AS clave, count(*) AS n, "
            f"min({col})::text AS mn, max({col})::text AS mx FROM {rel}"
        )
    filas = {r["clave"]: r for r in db.query(" UNION ALL ".join(partes))}
    out = []
    for clave, (rel, tcol) in RELACIONES.items():
        r = filas.get(clave, {})
        out.append({
            "clave": clave,
            "relacion": rel,
            "columna_tiempo": tcol,
            "filas": r.get("n"),
            "desde": r.get("mn"),
            "hasta": r.get("mx"),
        })
    return {"relaciones": out}


def columnas(tabla: str) -> dict:
    """Esquema (columnas + tipos) de una relacion de la allowlist."""
    rel, tcol = _rel(tabla)
    return {"tabla": tabla, "relacion": rel, "columna_tiempo": tcol,
            "columnas": _columnas(rel)}


def muestra(tabla: str, limit: int = 20, orden: str = "desc") -> dict:
    """Ultimas (o primeras) `limit` filas crudas de una relacion, para cruzar datos.

    `orden='desc'` (default) trae lo mas reciente; 'asc' lo mas antiguo. La
    relacion sale de la allowlist; el limite se acota a [1, 500]."""
    rel, tcol = _rel(tabla)
    lim = max(1, min(int(limit), _LIMITE_MAX))
    if tcol:
        direccion = "ASC" if str(orden).lower() == "asc" else "DESC"
        filas = db.query(f"SELECT * FROM {rel} ORDER BY {tcol} {direccion} LIMIT %s", (lim,))
    else:
        filas = db.query(f"SELECT * FROM {rel} LIMIT %s", (lim,))
    cols = list(filas[0].keys()) if filas else [c["nombre"] for c in _columnas(rel)]
    return {"tabla": tabla, "relacion": rel, "orden": orden,
            "columnas": cols, "filas": filas}

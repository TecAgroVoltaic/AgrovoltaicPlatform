"""Resolucion de lo pedido contra el catalogo (el borde de seguridad).

Dataset, formato, columnas, filtros y paso se validan aca ANTES de que cualquier
nombre llegue a un SQL o a la API; lo desconocido corta con ValueError.
"""
from __future__ import annotations

from historico import db
from historico.exportar.datasets import DATASETS, FUENTES
from historico.exportar.modelo import FORMATOS, PASOS_SEG, Columna, Dataset


def _ds(fuente: str, tabla: str) -> Dataset:
    if fuente not in FUENTES:
        raise ValueError(f"fuente desconocida: {fuente!r} (validas: {', '.join(FUENTES)})")
    ds = DATASETS.get((fuente, tabla))
    if ds is None:
        validas = ", ".join(k for f, k in DATASETS if f == fuente)
        raise ValueError(f"relacion desconocida: {tabla!r} en la fuente {fuente!r} (validas: {validas})")
    return ds


def _formato(formato: str) -> tuple[str, str]:
    par = FORMATOS.get((formato or "").lower())
    if par is None:
        raise ValueError(f"formato invalido: {formato!r} (validos: {', '.join(FORMATOS)})")
    return par


def _columnas(ds: Dataset) -> list[Columna]:
    """Columnas del dataset: estaticas (joins) o leidas del catalogo real (tablas planas)."""
    if ds.columnas:
        return list(ds.columnas)
    filas = db.query(
        """
        SELECT column_name AS nombre, data_type AS tipo
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (ds.relacion,),
    )
    if not filas:
        raise ValueError(f"la relacion {ds.relacion!r} no existe en la base o no tiene columnas")
    return [Columna(f["nombre"], f["nombre"], f["tipo"]) for f in filas]


def _seleccion(ds: Dataset, columnas: list[str] | None) -> list[Columna]:
    """Columnas a exportar, validadas contra el catalogo. Sin `columnas` -> todas.
    Con `columnas` -> ese subconjunto, en ese orden, con la temporal siempre primero
    (sin ella el archivo no se ubica en el tiempo). Un nombre desconocido corta."""
    # `_columnas` se busca en la fachada del paquete: es el punto que se sustituye
    # (tests, dobles) para no leer `information_schema`.
    from historico import exportar as fachada

    reales = fachada._columnas(ds)
    por_nombre = {c.nombre: c for c in reales}
    if not columnas:
        return reales
    pedidas = [c.strip() for c in columnas if c and c.strip()]
    desconocidas = [c for c in pedidas if c not in por_nombre]
    if desconocidas:
        raise ValueError(
            f"columnas desconocidas: {', '.join(desconocidas)} (validas: {', '.join(por_nombre)})"
        )
    if ds.talias and ds.talias not in pedidas:
        pedidas.insert(0, ds.talias)
    vistas: set[str] = set()
    return [por_nombre[c] for c in pedidas if not (c in vistas or vistas.add(c))]


def _filtros(ds: Dataset, filtros: dict[str, list[str]] | None) -> tuple[list[str], list]:
    """Clausulas WHERE extra (`expr = ANY(%s)`) para los filtros que el dataset declara."""
    clausulas: list[str] = []
    params: list = []
    for nombre, valores in (filtros or {}).items():
        vals = [v for v in (valores or []) if v]
        if not vals:
            continue
        expr = ds.filtros.get(nombre)
        if expr is None:
            raise ValueError(
                f"filtro no admitido para {ds.clave!r}: {nombre!r} "
                f"(validos: {', '.join(ds.filtros) or 'ninguno'})"
            )
        clausulas.append(f"{expr} = ANY(%s)")
        params.append(vals)
    return clausulas, params


def _paso(ds: Dataset, paso: int | None) -> int:
    """Ancho del bucket (seg) para la via API; 0 = crudo. Solo si el dataset lo admite."""
    p = int(paso or 0)
    if p and not ds.paso:
        raise ValueError(f"{ds.clave!r} no admite 'paso'")
    if p not in PASOS_SEG:
        raise ValueError(f"paso invalido: {p} (validos: {', '.join(map(str, PASOS_SEG))})")
    return p

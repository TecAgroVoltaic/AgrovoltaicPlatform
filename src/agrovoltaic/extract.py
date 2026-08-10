"""Extraccion: leer un CSV crudo, normalizar columnas, tipar.

Resuelve dos inconsistencias estructurales:
  1. 13 schemas distintos  -> normalize_columns() via mapa de alias (schemas.py)
  2. Filas de fuentes mezcladas -> el split por columnas lo hace transform.split_streams()
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from .schemas import CANONICAL_COLUMNS, canonical_name

logger = logging.getLogger(__name__)


def read_raw_csv(path: Path) -> pd.DataFrame:
    """Lee un CSV crudo (todo como string para no perder nada).

    Algunos archivos mezclan filas de distinta fuente con distinto nº de columnas
    (inversor 17-22 cols vs sensor 3-4 cols bajo un mismo header). El parser C
    revienta con esas filas raras; se reintenta con el engine python saltando las
    filas que no encajan con el header y se registra cuantas se perdieron.

    NOTA: separar correctamente esas filas (Paso 2 del pipeline) queda pendiente;
    por ahora se conservan las que coinciden con el header del archivo.
    """
    common = dict(dtype=str, keep_default_na=True, skip_blank_lines=True)
    try:
        return pd.read_csv(path, **common)
    except pd.errors.ParserError:
        skipped: list[int] = []
        df = pd.read_csv(
            path, engine="python",
            on_bad_lines=lambda bad: skipped.append(1) or None,  # type: ignore[arg-type]
            **common,
        )
        logger.warning(
            "%s: %d filas con nº de columnas distinto al header, saltadas "
            "(filas mezcladas — pendiente Paso 2)", path.name, len(skipped),
        )
        return df


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Renombra columnas crudas a canonicas y reindexa al superset.

    - Columnas en DROP_COLUMNS o desconocidas se descartan.
    - Columnas faltantes se crean vacias (NaN).
    - Si dos columnas crudas mapean al mismo canonico, se combina (coalesce).
    """
    rename: dict[str, str] = {}
    for col in df.columns:
        canon = canonical_name(col)
        if canon is not None:
            rename[col] = canon

    df = df[list(rename.keys())].rename(columns=rename)

    # Coalesce de duplicados (p.ej. dos alias -> misma canonica)
    if df.columns.duplicated().any():
        df = df.T.groupby(level=0).first().T

    # Reindexar al superset canonico, columnas faltantes = NaN
    return df.reindex(columns=CANONICAL_COLUMNS)


def to_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte todas las columnas menos timestamp a numerico (errores -> NaN)."""
    out = df.copy()
    for col in out.columns:
        if col == "timestamp":
            continue
        out[col] = pd.to_numeric(out[col], errors="coerce")
    return out


def parse_timestamp(df: pd.DataFrame) -> pd.DataFrame:
    """Parsea timestamp a datetime. Filas sin timestamp valido se descartan.

    NOTA: sitio en Costa Rica (UTC-6, resuelto 2026-06-16). El timestamp se deja
    naive tal como viene en el CSV; el manejo de zona explicito se hace aguas abajo.
    """
    out = df.copy()
    out["timestamp"] = pd.to_datetime(out["timestamp"], errors="coerce")
    n_bad = out["timestamp"].isna().sum()
    if n_bad:
        logger.warning("Descartadas %d filas sin timestamp valido", n_bad)
    return out.dropna(subset=["timestamp"])


def extract_file(path: Path) -> pd.DataFrame:
    """Pipeline de extraccion completo para un archivo: crudo -> df canonico tipado."""
    df = read_raw_csv(path)
    df = normalize_columns(df)
    df = to_numeric(df)
    df = parse_timestamp(df)
    df["fuente_archivo"] = path.name
    logger.info("Extraido %s: %d filas", path.name, len(df))
    return df

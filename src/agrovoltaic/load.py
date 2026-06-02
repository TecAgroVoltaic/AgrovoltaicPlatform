"""Carga a Supabase: UPSERT idempotente a nivel de fila.

PRIMARY KEY = timestamp. ON CONFLICT DO UPDATE => re-correr nunca duplica.
Carga masiva con executemany sobre conexion directa (no REST).
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
import psycopg

from . import config
from .schemas import CANONICAL_COLUMNS, GENERATED_COLUMNS

logger = logging.getLogger(__name__)


def truncate(conn: psycopg.Connection) -> None:
    """Vacia la tabla principal y el log de ingesta (rebuild limpio del reprocesado full)."""
    with conn.cursor() as cur:
        cur.execute(f"TRUNCATE TABLE {config.TABLE_MAIN}")
        cur.execute(f"TRUNCATE TABLE {config.TABLE_INGEST_LOG}")
    logger.info("Tablas %s y %s truncadas", config.TABLE_MAIN, config.TABLE_INGEST_LOG)


# Columnas que se insertan = schema canonico + metadata generada. Derivado, no quemado.
_INSERT_COLUMNS = CANONICAL_COLUMNS + list(GENERATED_COLUMNS)


def _rows_for_insert(df: pd.DataFrame) -> list[tuple]:
    """Convierte el df a lista de tuplas, NaN -> None (NULL en Postgres)."""
    frame = df.reindex(columns=_INSERT_COLUMNS)
    frame = frame.replace({np.nan: None})
    return [tuple(r) for r in frame.itertuples(index=False, name=None)]


def upsert(conn: psycopg.Connection, df: pd.DataFrame) -> int:
    """Upsert del df a la tabla principal. Devuelve nº de filas enviadas."""
    if df.empty:
        return 0

    cols = ", ".join(_INSERT_COLUMNS)
    placeholders = ", ".join(["%s"] * len(_INSERT_COLUMNS))
    updates = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in _INSERT_COLUMNS if c != "timestamp"
    )
    sql = (
        f"INSERT INTO {config.TABLE_MAIN} ({cols}) VALUES ({placeholders}) "
        f"ON CONFLICT (timestamp) DO UPDATE SET {updates}"
    )

    rows = _rows_for_insert(df)
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    logger.info("Upsert %d filas en %s", len(rows), config.TABLE_MAIN)
    return len(rows)

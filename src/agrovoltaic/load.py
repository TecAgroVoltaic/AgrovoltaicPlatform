"""Carga a Supabase: UPSERT idempotente a nivel de fila, por tabla.

PRIMARY KEY = timestamp en cada tabla. ON CONFLICT DO UPDATE => re-correr nunca
duplica. Carga masiva con executemany sobre conexion directa (no REST).
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
import psycopg

from . import config
from .schemas import electrico_table_columns, radiacion_table_columns

logger = logging.getLogger(__name__)


def truncate(conn: psycopg.Connection) -> None:
    """Vacia las tablas de datos y el log de ingesta (rebuild limpio del full)."""
    with conn.cursor() as cur:
        cur.execute(f"TRUNCATE TABLE {config.TABLE_ELECTRICO}")
        cur.execute(f"TRUNCATE TABLE {config.TABLE_RADIACION}")
        cur.execute(f"TRUNCATE TABLE {config.TABLE_INGEST_LOG}")
    logger.info("Tablas de datos y log de ingesta truncadas")


def _rows_for_insert(df: pd.DataFrame, columns: list[str]) -> list[tuple]:
    """Convierte el df a lista de tuplas alineadas a `columns`, NaN -> None (NULL)."""
    frame = df.reindex(columns=columns).replace({np.nan: None})
    return [tuple(r) for r in frame.itertuples(index=False, name=None)]


def upsert(conn: psycopg.Connection, df: pd.DataFrame, table: str, columns: list[str]) -> int:
    """Upsert del df a `table` (PK timestamp). Devuelve nº de filas enviadas."""
    if df is None or df.empty:
        return 0

    cols = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in columns if c != "timestamp")
    sql = (
        f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) "
        f"ON CONFLICT (timestamp) DO UPDATE SET {updates}"
    )

    rows = _rows_for_insert(df, columns)
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    logger.info("Upsert %d filas en %s", len(rows), table)
    return len(rows)


def upsert_electrico(conn: psycopg.Connection, df: pd.DataFrame) -> int:
    return upsert(conn, df, config.TABLE_ELECTRICO, electrico_table_columns())


def upsert_radiacion(conn: psycopg.Connection, df: pd.DataFrame) -> int:
    return upsert(conn, df, config.TABLE_RADIACION, radiacion_table_columns())

"""Estado de ingesta: idempotencia a nivel de archivo via md5.

Tabla _ingest_log guarda (filename, md5, rows, processed_at). El pipeline solo
procesa archivos nuevos o cuyo contenido cambio. Asi, agregar un CSV nuevo y
re-correr solo procesa ese archivo.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import psycopg

from . import config


def file_md5(path: Path) -> str:
    """md5 del contenido del archivo (hex)."""
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def get_processed(conn: psycopg.Connection) -> dict[str, str]:
    """Devuelve {filename: md5} de los archivos ya ingestados."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT filename, md5 FROM {config.TABLE_INGEST_LOG}")
        return {row[0]: row[1] for row in cur.fetchall()}


def needs_processing(path: Path, processed: dict[str, str]) -> bool:
    """True si el archivo es nuevo o su md5 cambio respecto al registro."""
    prev = processed.get(path.name)
    return prev is None or prev != file_md5(path)


def mark_processed(conn: psycopg.Connection, path: Path, rows: int) -> None:
    """Registra/actualiza el archivo en _ingest_log (upsert por filename)."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {config.TABLE_INGEST_LOG} (filename, md5, rows, processed_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (filename) DO UPDATE
              SET md5 = EXCLUDED.md5,
                  rows = EXCLUDED.rows,
                  processed_at = now()
            """,
            (path.name, file_md5(path), rows),
        )

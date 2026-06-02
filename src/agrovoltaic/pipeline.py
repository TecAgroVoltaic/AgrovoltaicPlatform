"""Orquestador: extract -> transform -> load, idempotente y escalable.

Flujo:
  1. Lista CSVs de la carpeta dataset
  2. Salta los ya procesados (md5 sin cambios) salvo --full
  3. Por cada archivo: extract -> transform -> upsert
  4. Marca el archivo en _ingest_log

Agregar un CSV nuevo = soltarlo en la carpeta y correr de nuevo.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
import psycopg

from . import config, extract, load, state, transform

logger = logging.getLogger(__name__)


@dataclass
class RunResult:
    processed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)
    total_rows: int = 0


def list_csv_files(folder: Path | None = None) -> list[Path]:
    """CSVs ordenados por nombre (cronologico por la fecha en el nombre)."""
    folder = folder or config.DATASET_DIR
    return sorted(folder.glob("*.csv"))


def process_file(path: Path) -> pd.DataFrame:
    """extract + transform de un solo archivo (sin tocar DB). Reusable en tests."""
    df = extract.extract_file(path)
    return transform.transform_file(df)


def run(full: bool = False, folder: Path | None = None) -> RunResult:
    """Corre el pipeline completo contra Supabase."""
    result = RunResult()
    files = list_csv_files(folder)

    with psycopg.connect(config.require_database_url()) as conn:
        processed = {} if full else state.get_processed(conn)

        # Reprocesado full = rebuild limpio: vaciar la tabla antes de recargar.
        if full:
            load.truncate(conn)
            conn.commit()

        for path in files:
            if not full and not state.needs_processing(path, processed):
                result.skipped.append(path.name)
                continue
            try:
                df = process_file(path)
                n = load.upsert(conn, df)
                state.mark_processed(conn, path, n)
                conn.commit()
                result.processed.append(path.name)
                result.total_rows += n
            except Exception as exc:  # noqa: BLE001 — un archivo malo no frena el resto
                conn.rollback()
                logger.exception("Fallo procesando %s", path.name)
                result.failed[path.name] = str(exc)

    logger.info(
        "Pipeline: %d procesados, %d saltados, %d fallidos, %d filas",
        len(result.processed), len(result.skipped), len(result.failed),
        result.total_rows,
    )
    return result


def dry_run(folder: Path | None = None) -> pd.DataFrame:
    """Procesa todos los archivos SIN cargar a DB. Devuelve el df combinado.

    Util para validar transforms antes de tener credenciales de Supabase.
    """
    frames = []
    for path in list_csv_files(folder):
        try:
            frames.append(process_file(path))
        except Exception:  # noqa: BLE001
            logger.exception("Fallo (dry-run) %s", path.name)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

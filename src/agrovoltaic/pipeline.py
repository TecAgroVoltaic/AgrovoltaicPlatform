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

from . import calibracion, config, extract, load, performance, state, transform

logger = logging.getLogger(__name__)


@dataclass
class RunResult:
    processed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)
    rows_electrico: int = 0
    rows_radiacion: int = 0

    @property
    def total_rows(self) -> int:
        return self.rows_electrico + self.rows_radiacion


def list_csv_files(folder: Path | None = None) -> list[Path]:
    """CSVs ordenados por nombre (cronologico por la fecha en el nombre)."""
    folder = folder or config.DATASET_DIR
    return sorted(folder.glob("*.csv"))


def process_file(path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """extract + transform de un archivo (sin tocar DB). Devuelve (electrico, radiacion)."""
    df = extract.extract_file(path)
    return transform.transform_file(df)


def run(full: bool = False, folder: Path | None = None) -> RunResult:
    """Corre el pipeline completo contra Supabase (dos tablas: electrico + radiacion)."""
    result = RunResult()
    files = list_csv_files(folder)

    with psycopg.connect(config.require_database_url()) as conn:
        processed = {} if full else state.get_processed(conn)

        # Reprocesado full = rebuild limpio: vaciar las tablas antes de recargar.
        if full:
            load.truncate(conn)
            conn.commit()

        for path in files:
            if not full and not state.needs_processing(path, processed):
                result.skipped.append(path.name)
                continue
            try:
                elec, rad = process_file(path)
                n_e = load.upsert_electrico(conn, elec)
                n_r = load.upsert_radiacion(conn, rad)
                state.mark_processed(conn, path, n_e + n_r)
                conn.commit()
                result.processed.append(path.name)
                result.rows_electrico += n_e
                result.rows_radiacion += n_r
            except Exception as exc:  # noqa: BLE001 — un archivo malo no frena el resto
                conn.rollback()
                logger.exception("Fallo procesando %s", path.name)
                result.failed[path.name] = str(exc)

        # Calibracion/QC: poblar clear-sky de referencia + POA por arreglo (bifacial).
        try:
            calibracion.refresh_clearsky(conn, full=full)
            conn.commit()
            performance.refresh_poa(conn, full=full)
            conn.commit()
        except Exception:  # noqa: BLE001 — no frenar la carga por la capa solar
            conn.rollback()
            logger.exception("Fallo el refresh de clear-sky/POA (datos cargados igual)")

    logger.info(
        "Pipeline: %d procesados, %d saltados, %d fallidos | electrico=%d radiacion=%d filas",
        len(result.processed), len(result.skipped), len(result.failed),
        result.rows_electrico, result.rows_radiacion,
    )
    return result


def dry_run(folder: Path | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Procesa todos los archivos SIN cargar a DB. Devuelve (electrico, radiacion) combinados.

    Util para validar transforms antes de tener credenciales de Supabase.
    """
    elec_frames, rad_frames = [], []
    for path in list_csv_files(folder):
        try:
            elec, rad = process_file(path)
            if not elec.empty:
                elec_frames.append(elec)
            if not rad.empty:
                rad_frames.append(rad)
        except Exception:  # noqa: BLE001
            logger.exception("Fallo (dry-run) %s", path.name)
    elec = pd.concat(elec_frames, ignore_index=True) if elec_frames else pd.DataFrame()
    rad = pd.concat(rad_frames, ignore_index=True) if rad_frames else pd.DataFrame()
    return elec, rad

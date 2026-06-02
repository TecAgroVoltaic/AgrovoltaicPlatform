"""Configuracion central: paths, conexion Supabase, constantes del pipeline."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# --- Paths ------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = ROOT / "dataset" / "Monitoreo-AgroVoltaic-SC-NEW"
SQL_DIR = ROOT / "sql"
SCHEMA_FILE = SQL_DIR / "schema.sql"
OUTPUT_DIR = ROOT / "output"
DRY_RUN_CSV = OUTPUT_DIR / "dry_run.csv"

# --- Conexion Supabase / Postgres -------------------------------------------
# Usar la "Direct connection" o "Session pooler" de Supabase (no la REST API)
# para carga masiva. Definir en .env (ver .env.example).
DATABASE_URL = os.getenv("DATABASE_URL")

# --- Constantes del pipeline ------------------------------------------------
RESAMPLE_INTERVAL = "5min"          # decision: resamplear al intervalo mas grueso
OFFSET_NOCTURNO = -38.845008416418494  # offset del piranometro -> 0
TEMP_SENSOR_ERROR = 85.0            # DS18B20 desconectado -> NULL
TEMP_VALID_RANGE = (-10.0, 70.0)    # fuera de rango -> NULL (respaldado por AgroDash)
FREQ_VALID_RANGE = (59.0, 61.0)
VAC_VALID_RANGE = (100.0, 280.0)

# Tabla destino
TABLE_MAIN = "monitoreo_agrovoltaic"
TABLE_INGEST_LOG = "_ingest_log"


def require_database_url() -> str:
    """Devuelve DATABASE_URL o falla con mensaje claro."""
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL no definida. Copia .env.example a .env y completa la "
            "cadena de conexion de Supabase (Settings > Database > Connection string)."
        )
    return DATABASE_URL

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


def _envf(key: str, default: float) -> float:
    """Lee un float de env con default."""
    v = os.getenv(key)
    return float(v) if v else default


# --- Sitio (para clear-sky, ver geometria-sistema) --------------------------
# San Carlos, Costa Rica. Mismos valores que agente-pronostico/.../config.py.
SITE_LAT = _envf("SITE_LAT", 10.33)
SITE_LON = _envf("SITE_LON", -84.42)
SITE_ALT = _envf("SITE_ALT", 600.0)
SITE_TZ = os.getenv("SITE_TZ", "America/Costa_Rica")  # UTC-6 fijo, sin DST

# --- Calibracion / QC de irradiancia ----------------------------------------
# Hallazgo 2026-08-10: la irradiancia del periodo VALIDO (post 2025-07-01) YA
# esta en W/m2 (factor empirico k~0.98 por clear-sky). Se toma escala = 1.0.
IRRAD_SCALE = _envf("IRRAD_SCALE", 1.0)
UMBRAL_CS = _envf("UMBRAL_CS", 20.0)   # W/m2 min de clear-sky para calcular kt* (como el forecaster)
KT_STAR_MAX = _envf("KT_STAR_MAX", 1.3)  # kt* mayor = outlier fisico (ruido) -> qc_ok false

# --- Geometria de arreglos y Performance Ratio ------------------------------
# tilt/azimut de geometria-sistema (Norte=0, horario). p0 = Wp instalados por arreglo.
# PV1 = arreglo 1 = inclinado ; PV2 = arreglo 2 = vertical (ambos bifaciales).
PV_ARRAYS = {
    "pv1": dict(tilt=20.0, az=150.0, p0=1420.0),  # inclinado
    "pv2": dict(tilt=90.0, az=50.0, p0=1420.0),   # vertical
}
PHI_BIFACIAL = _envf("PHI_BIFACIAL", 0.80)  # factor de bifacialidad (asumido; convergencia PR lo respalda)
UMBRAL_POA = _envf("UMBRAL_POA", 100.0)     # W/m2 min de POA para calcular PR (evita noche/baja luz)

# --- Resampleo (decision validada con Leo Cardinale, 2026-08-10) ------------
# Variables electricas -> 5 min; radiacion -> 15 s en tabla APARTE. La radiacion
# se definio a 10 s y se subio a 15 s (ThingSpeak no permite <15 s). Muestreos
# <10 s (pruebas) se promedian a 15 s. Ver docs/memoria/decisiones/respuestas-leo-cardinale.md
RESAMPLE_ELECTRICO = "5min"
RESAMPLE_RADIACION = "15s"

# --- Capa de CORRECCION (parametros) ----------------------------------------
# IMPORTANTE: estos valores NO se aplican al dato crudo en la ingesta. El crudo
# se conserva tal cual en las tablas base; la correccion vive en VISTAS SQL
# (v_*_corregido) que se generan con estos umbrales. Regla rectora de Leo:
# "dejar el crudo y corregir en una capa de analisis con variables nuevas".
OFFSET_NOCTURNO = -38.845008416418494  # offset nocturno del piranometro -> 0 (en la vista)
TEMP_SENSOR_ERROR = 85.0            # DS18B20 desconectado (codigo de error)
TEMP_VALID_RANGE = (10.0, 80.0)     # Leo (P9): temperaturas validas 10-80 C
FREQ_VALID_RANGE = (55.0, 65.0)     # P9: frecuencia de red
VAC_VALID_RANGE = (100.0, 280.0)
VOLT_STRING_RANGE = (0.0, 600.0)    # P9: voltaje por string
CORR_STRING_RANGE = (0.0, 20.0)     # P9: corriente por string
POT_STRING_RANGE = (0.0, 5000.0)    # P9 provisional (kWp real: 1420 Wp/arreglo, ver geometria-sistema)
ALBEDO_RANGE = (0.0, 1.0)           # P9: albedo
# Leo (P12): la irradiancia de los primeros meses tuvo un error corregido a
# mediados de 2025 -> las mediciones previas a esta fecha NO son validas.
IRRAD_INVALIDA_ANTES = "2025-07-01"

# --- Tablas destino (modelo nuevo: crudo + radiacion aparte) ----------------
TABLE_ELECTRICO = "monitoreo_sc_electrico"   # 1 fila = 1 ventana de 5 min (crudo)
TABLE_RADIACION = "radiacion_sc_15s"         # 1 fila = 1 ventana de 15 s (crudo)
TABLE_CLEARSKY = "radiacion_sc_clearsky"     # cs_ghi_wm2 por timestamp (pvlib, capa de analisis)
TABLE_POA = "radiacion_sc_poa"               # POA por arreglo (frontal + bifacial) por timestamp
TABLE_DICCIONARIO = "diccionario_variables"  # definiciones/abreviaciones (Leo P1)
TABLE_INGEST_LOG = "_ingest_log"
VIEW_ELECTRICO_CORR = "v_sc_electrico_corregido"
VIEW_RADIACION_CORR = "v_sc_radiacion_corregida"
VIEW_RADIACION_CAL = "v_sc_radiacion_calibrada"  # crudo + clear-sky: wm2, kt_star, qc_ok
VIEW_PERFORMANCE = "v_sc_performance"        # PR por arreglo (potencia vs POA bifacial)


def require_database_url() -> str:
    """Devuelve DATABASE_URL o falla con mensaje claro."""
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL no definida. Copia .env.example a .env y completa la "
            "cadena de conexion de Supabase (Settings > Database > Connection string)."
        )
    return DATABASE_URL

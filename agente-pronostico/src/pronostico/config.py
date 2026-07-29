"""
Configuracion del agente de pronostico — UNICA fuente de verdad.

Todo lo que sea "parametro del sistema" (geografia del sitio, umbrales fisicos,
credenciales de la base, modelo del LLM, rutas de cache) vive AQUI y solo aqui.
Cambiar el sitio, el modelo o el canal es tocar este archivo, no diez.

Carga `.env` con python-dotenv (sin pisar variables ya presentes en el entorno,
asi la contrasena inyectada inline en tiempo de ejecucion siempre gana). El
archivo `.env` NO se versiona; las contrasenas nunca van en el codigo.
"""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

# Raiz del proyecto = agente-pronostico/ (dos niveles arriba de este archivo:
#   .../agente-pronostico/src/pronostico/config.py  -> parents[2] = agente-pronostico/)
ROOT = Path(__file__).resolve().parents[2]

# Carga .env si existe. override=False (por defecto): las variables ya definidas
# en el entorno (p.ej. AGRODASH_PASSWORD inyectada inline) tienen prioridad.
load_dotenv(ROOT / ".env")

# ── Perfil de sitio (INTERCAMBIABLE POR ENV, sin tocar codigo) ───────────────
# Un "sitio" = geografia (para el clear-sky) + que caja/canal/sensor leer + la
# ventana usable. Cambiar de San Carlos a Cartago (u otra replica AgroDash) es
# cuestion de VARIABLES DE ENTORNO, no de codigo: DATABASE_URL + SITE_* +
# BOX_NAME + IRRADIANCE_CHANNEL + WINDOW_*. Los defaults = San Carlos (validado).
def _envf(key: str, default: float) -> float:
    """Override numerico por entorno (vacio/ausente -> default)."""
    v = os.environ.get(key)
    return float(v) if v not in (None, "") else default


SITE = os.environ.get("SITE_NAME", "San Carlos")      # nombre del sitio (logs / redaccion)
LAT = _envf("SITE_LAT", 10.33)                        # latitud
LON = _envf("SITE_LON", -84.42)                       # longitud
ALT = _envf("SITE_ALT", 600.0)                        # altitud (nivel ciudad)
TZ = os.environ.get("SITE_TZ", "America/Costa_Rica")  # UTC-6 fijo, sin horario de verano
# Atajo geografico para pvlib: physics.clear_sky_ghi(times, **SITE_GEO).
SITE_GEO = dict(lat=LAT, lon=LON, alt=ALT, tz=TZ)

# ── Fisica / identidad del sensor ────────────────────────────────────────────
UMBRAL_CS = _envf("UMBRAL_CS", 20.0)   # W/m2: umbral de "dia" para kt* (evita /0 nocturno)
SENSOR_TYPE = os.environ.get("SENSOR_TYPE", "irradiancia")    # tipo de sensor en AgroDash
BOX_NAME = os.environ.get("BOX_NAME", "Caja Irradiancia SC")  # caja (6 canales GHI incidente)
# Canal (sensor_id) preferido de irradiancia. Los canales de la caja empatan en
# conteo y miden el mismo GHI incidente; se fija para que la eleccion sea
# REPRODUCIBLE (no dependa del orden de value_counts). Cambia por sitio.
CANAL_IRRADIANCIA = os.environ.get(
    "IRRADIANCE_CHANNEL", "45a5c0a7-0ef4-4291-96f3-60d2b60a0584")
# Ventana usable [inicio, fin) del sitio (fin EXCLUSIVO). Propia de cada replica.
WINDOW_START = os.environ.get("WINDOW_START", "2026-03-10")
WINDOW_END = os.environ.get("WINDOW_END", "2026-07-01")
# Cadencia objetivo (documental; el forecaster empareja en cadencia nativa).
RESAMPLE = os.environ.get("RESAMPLE", "5min")

# ── Base de datos (replica PostgreSQL — SOLO LECTURA) ─────────────────────────
# DB POR URL: si DATABASE_URL (o AGRODASH_URL) esta definida, MANDA -> conectar
# Cartago u otra replica = cambiar esa URL, cero cambios de codigo. Si no, se
# construye desde AGRODASH_HOST/PORT/DB/USER + AGRODASH_PASSWORD (compat). Todo
# se lee de forma PEREZOSA en conninfo() para no exigir nada al importar (tests,
# import del agente). El SOLO-LECTURA se fuerza al conectar (ver data.py).
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("AGRODASH_URL")
AGRODASH_HOST = os.environ.get("AGRODASH_HOST", "100.100.130.47")
AGRODASH_PORT = int(os.environ.get("AGRODASH_PORT", "5432"))
AGRODASH_DB = os.environ.get("AGRODASH_DB", "agrodash_control")
AGRODASH_USER = os.environ.get("AGRODASH_USER", "postgres")


def conninfo() -> str:
    """Cadena de conexion psycopg. Fuente unica de verdad de 'a que DB conectar'.

    Prioridad: DATABASE_URL / AGRODASH_URL (una sola URL) -> si no, se arma desde
    las partes AGRODASH_* + AGRODASH_PASSWORD (KeyError explicito si falta la
    clave en ese modo). Perezosa: no exige nada al importar el modulo.
    """
    if DATABASE_URL:
        return DATABASE_URL
    pwd = os.environ["AGRODASH_PASSWORD"]              # obligatoria en modo por-partes
    # safe="" codifica TODO lo reservado (incluido '/' y ':') en usuario/clave,
    # si no una clave con '/' partiria la URL como si fuera el nombre de la base.
    return (f"postgresql://{quote(AGRODASH_USER, safe='')}:{quote(pwd, safe='')}"
            f"@{AGRODASH_HOST}:{AGRODASH_PORT}/{AGRODASH_DB}")


def dsn() -> dict:
    """DSN por PARTES (compat con scripts que pasan **kwargs a psycopg). La ruta
    de produccion usa conninfo()/DATABASE_URL; esto queda para validar_fisica.py."""
    return dict(
        host=AGRODASH_HOST,
        port=AGRODASH_PORT,
        dbname=AGRODASH_DB,
        user=AGRODASH_USER,
        password=os.environ["AGRODASH_PASSWORD"],  # obligatoria: KeyError si no esta
    )


# ── Store de escritura/lectura (Supabase de AgroVoltaic) ──────────────────────
# Arquitectura A: conninfo() apunta a la FUENTE (AgroDash, read-only) que el ETL
# LEE; STORE_URL apunta a la Supabase de AgroVoltaic donde el ETL ESCRIBE y el
# forecaster LEE. Separar ambas evita mezclar "de donde traigo" con "donde guardo".
STORE_URL = os.environ.get("STORE_URL")


def store_conninfo() -> str:
    """Conexion al store Supabase (escritura del ETL + lectura del forecaster)."""
    if not STORE_URL:
        raise RuntimeError(
            "STORE_URL no definida: es la Supabase de AgroVoltaic (Session pooler). "
            "Definila en .env o en el entorno del contenedor."
        )
    return STORE_URL


# ── LLM (Claude / Anthropic) ─────────────────────────────────────────────────
# El LLM SOLO orquesta (entiende, rutea, redacta). Nunca calcula numeros -> es una
# tarea liviana: Haiku alcanza y es mucho mas barato/rapido que Opus. Se puede
# subir a Sonnet/Opus con ANTHROPIC_MODEL si algun dia hiciera falta mas capacidad.
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")
MAX_TOKENS = 2048

# ── Rutas ────────────────────────────────────────────────────────────────────
# DATA_DIR es overrideable por entorno porque ROOT solo es correcto en el layout
# de fuente (agente-pronostico/src/pronostico/). Instalado con pip el paquete vive
# en site-packages y parents[2] apunta a la raiz del interprete, no al proyecto
# -> en el contenedor hay que apuntar DATA_DIR al volumen (p. ej. /app/data).
DATA_DIR = Path(os.environ.get("DATA_DIR") or ROOT / "data")   # cache (no se versiona)
# Cache por sitio: default preserva el archivo actual (San Carlos); otra replica
# usa CACHE_FILE distinto para no mezclar series entre sitios.
CACHE_PATH = DATA_DIR / os.environ.get("CACHE_FILE", "irradiancia_sc.parquet")

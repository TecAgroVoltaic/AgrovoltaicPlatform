"""Configuracion del Historico — unica fuente de verdad.

Solo configuracion (SRP): a que DB conectar, que modelo LLM, ventana de datos.
Los umbrales de calidad y el sitio viven en `historico.config_calidad` y se
reexportan aca: se siguen leyendo como `config.RANGOS`, `config.TZ`, etc.
Carga el `.env` propio (agente-historico/.env) y, como fallback, el `.env` de la
raiz del repo (que ya tiene el DATABASE_URL de la Supabase PV del pipeline).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]   # agente-historico/
REPO = Path(__file__).resolve().parents[3]   # raiz del repo (tiene .env con DATABASE_URL)

load_dotenv(ROOT / ".env")                    # propio (gana, override=False por defecto)
load_dotenv(REPO / ".env")                    # fallback: DATABASE_URL del pipeline PV


def database_url() -> str:
    """Cadena de conexion a la Supabase PV (solo lectura). Perezosa (no exige al importar)."""
    url = (os.environ.get("HISTORICO_DB_URL")
           or os.environ.get("HISTORICO_DB_URL")   # nombre anterior, respaldo
           or os.environ.get("DATABASE_URL"))
    if not url:
        raise RuntimeError(
            "Falta DATABASE_URL (o HISTORICO_DB_URL): la Supabase PV de AgroVoltaic. "
            "Definila en agente-historico/.env o en la raiz del repo."
        )
    return url


# LLM: solo orquesta (entiende/rutea/redacta) -> Haiku alcanza y es barato.
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")
# El asistente de pantalla completa (`/chat/stream`) elige grafico, tipo y rango, y
# redacta sobre varios pasos: ahi Haiku se queda corto. `/chat` y `/preguntar`
# conservan `MODEL`.
MODEL_ASISTENTE = os.environ.get("ANTHROPIC_MODEL_ASISTENTE", "claude-sonnet-5-5")
MAX_TOKENS = 2048

# Rango historico disponible (para el system prompt; los datos no son en vivo).
DATA_DESDE = os.environ.get("DATA_DESDE", "2024-11-10")
DATA_HASTA = os.environ.get("DATA_HASTA", "2026-06-01")


# Sitio y politica de calidad (incluye TZ, la zona horaria del sitio). Se cargan
# DESPUES del `.env`, porque sus valores salen del entorno.
from historico.config_calidad import (  # noqa: E402,F401
    COBERTURA_MINIMA, COLUMNAS_TEMPERATURA, CS_MINIMO_WM2, DENSIDAD_MINIMA,
    FACTOR_HUECO, KT_CUBIERTO, KT_DESPEJADO, KT_IMPOSIBLE, MIN_MUESTRAS_DIA,
    OFFSET_NOCTURNO, RANGOS, SITE_ALT, SITE_LAT, SITE_LON, TZ,
    VALOR_SATURACION_DS18B20, VI_VARIABLE,
)

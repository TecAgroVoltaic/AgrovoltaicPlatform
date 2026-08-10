"""Configuracion del analizador — unica fuente de verdad.

Solo configuracion (SRP): a que DB conectar, que modelo LLM, ventana de datos.
Carga el `.env` propio (agente-analizador/.env) y, como fallback, el `.env` de la
raiz del repo (que ya tiene el DATABASE_URL de la Supabase PV del pipeline).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]   # agente-analizador/
REPO = Path(__file__).resolve().parents[3]   # raiz del repo (tiene .env con DATABASE_URL)

load_dotenv(ROOT / ".env")                    # propio (gana, override=False por defecto)
load_dotenv(REPO / ".env")                    # fallback: DATABASE_URL del pipeline PV


def database_url() -> str:
    """Cadena de conexion a la Supabase PV (solo lectura). Perezosa (no exige al importar)."""
    url = os.environ.get("ANALIZADOR_DB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Falta DATABASE_URL (o ANALIZADOR_DB_URL): la Supabase PV de AgroVoltaic. "
            "Definila en agente-analizador/.env o en la raiz del repo."
        )
    return url


# LLM: solo orquesta (entiende/rutea/redacta) -> Haiku alcanza y es barato.
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")
MAX_TOKENS = 2048

# Zona horaria del sitio (los timestamps se guardaron como hora local CR).
TZ = "America/Costa_Rica"

# Rango historico disponible (para el system prompt; los datos no son en vivo).
DATA_DESDE = os.environ.get("DATA_DESDE", "2024-11-10")
DATA_HASTA = os.environ.get("DATA_HASTA", "2026-06-01")

"""Transformacion: limpieza de valores + normalizacion temporal (resampleo).

Implementa las decisiones tomadas (docs/memoria/decisiones/decisiones.md):
  - Temp 85.0 / fuera de rango -> NULL
  - Irradiancia offset -38.845 -> 0, negativos -> 0
  - Inversor: potencia negativa -> 0, freq/vac fuera de rango -> NULL
  - Resampleo a 5 min: mean para tasas, last para acumulados

NO incluye calibracion de irradiancia (Paso 5b) ni features PR/CSI (Paso 8):
estan bloqueados hasta tener lat/lon, kWp y modelo de piranometro.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from . import config
from .schemas import agg_method, cols_with_tag

logger = logging.getLogger(__name__)


def _clip_range(s: pd.Series, lo: float, hi: float) -> pd.Series:
    """Valores fuera de [lo, hi] -> NaN."""
    return s.mask((s < lo) | (s > hi))


def clean_temperatures(df: pd.DataFrame) -> pd.DataFrame:
    """85.0 (sensor desconectado) y fuera de rango -> NULL. Aplica a tag 'temperatura'."""
    out = df.copy()
    lo, hi = config.TEMP_VALID_RANGE
    for col in cols_with_tag("temperatura"):
        if col not in out.columns:
            continue
        bad = out[col] == config.TEMP_SENSOR_ERROR
        out[col] = out[col].mask(bad)
        out[col] = _clip_range(out[col], lo, hi)
    return out


def clean_irradiance(df: pd.DataFrame) -> pd.DataFrame:
    """Offset nocturno -> 0, negativos -> 0. Aplica a tag 'irradiancia_flux'.

    (Calibracion a W/m2 = pendiente hasta tener lat/lon y modelo de piranometro.)
    """
    out = df.copy()
    for col in cols_with_tag("irradiancia_flux"):
        if col not in out.columns:
            continue
        near_offset = np.isclose(out[col], config.OFFSET_NOCTURNO, atol=1e-3)
        out.loc[near_offset, col] = 0.0
        out.loc[out[col] < 0, col] = 0.0
    return out


def clean_inverter(df: pd.DataFrame) -> pd.DataFrame:
    """Potencia negativa -> 0 (tag 'potencia'); freq y vac fuera de rango -> NULL."""
    out = df.copy()
    for col in cols_with_tag("potencia"):
        if col in out.columns:
            out.loc[out[col] < 0, col] = 0.0
    if "frecuencia_hz" in out.columns:
        out["frecuencia_hz"] = _clip_range(out["frecuencia_hz"], *config.FREQ_VALID_RANGE)
    if "voltaje_vac" in out.columns:
        out["voltaje_vac"] = _clip_range(out["voltaje_vac"], *config.VAC_VALID_RANGE)
    return out


def resample_5min(df: pd.DataFrame) -> pd.DataFrame:
    """Resamplea a 5 min. El metodo por columna lo decide schemas.agg_method().

    Agrega n_muestras (filas originales por ventana) e intervalo_original_seg.
    """
    out = df.set_index("timestamp").sort_index()

    intervalo = out.index.to_series().diff().dt.total_seconds().median()

    # Agregacion derivada dinamicamente de las columnas presentes.
    agg = {col: agg_method(col) for col in out.columns}

    res = out.resample(config.RESAMPLE_INTERVAL).agg(agg)
    res["n_muestras"] = out.resample(config.RESAMPLE_INTERVAL).size()
    res["intervalo_original_seg"] = round(intervalo) if pd.notna(intervalo) else None

    # Ventanas vacias (sin filas reales) se descartan
    res = res[res["n_muestras"] > 0].reset_index()
    return res


def transform_file(df: pd.DataFrame) -> pd.DataFrame:
    """Pipeline de transformacion para el df de un archivo ya extraido."""
    df = clean_temperatures(df)
    df = clean_irradiance(df)
    df = clean_inverter(df)
    df = resample_5min(df)
    logger.info("Transformado -> %d filas a 5 min", len(df))
    return df

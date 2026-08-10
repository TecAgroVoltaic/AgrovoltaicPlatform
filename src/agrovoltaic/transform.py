"""Transformacion: split por fuente + normalizacion temporal (resampleo). SIN limpieza.

Regla rectora validada con Leo Cardinale (2026-08-10): **el dato crudo se conserva
tal cual en la base**; toda correccion (temp 85, offset −38.845, fuera de rango,
calibracion) vive en la CAPA DE ANALISIS (vistas SQL `v_*_corregido`, ver ddl.py),
generando variables corregidas nuevas. Aqui NO se anula ni se recorta ningun valor.

Este modulo:
  1. split_streams(): separa cada archivo en dos flujos por fuente fisica —
     ELECTRICO (inversor + DS18B20) y RADIACION (piranometro + SP722).
  2. resampleo por flujo a su cadencia oficial: electrico 5 min, radiacion 15 s
     (mean para tasas, last para acumuladores). Solo re-agrupa en el tiempo; los
     valores agregados son promedios/ultimos del CRUDO, no valores limpiados.

Ver docs/memoria/decisiones/respuestas-leo-cardinale.md (P2/P5/P8/P9).
"""

from __future__ import annotations

import logging

import pandas as pd

from . import config
from .schemas import agg_method, cols_electrico, cols_radiacion

logger = logging.getLogger(__name__)


def split_streams(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Separa el df extraido en (electrico, radiacion) por columnas de cada fuente.

    Una fila entra al flujo electrico si tiene >=1 medida electrica; entra al de
    radiacion si tiene >=1 medida de radiacion. Un archivo reciente (5 min) trae
    ambas en la misma fila -> aporta a los dos flujos (el crudo no se duplica: cada
    flujo toma solo sus columnas).
    """
    elec_cols = [c for c in cols_electrico() if c in df.columns]
    rad_cols = [c for c in cols_radiacion() if c in df.columns]

    if elec_cols:
        elec = df.loc[df[elec_cols].notna().any(axis=1), ["timestamp", *elec_cols]]
    else:
        elec = df.iloc[0:0][["timestamp"]]

    if rad_cols:
        rad = df.loc[df[rad_cols].notna().any(axis=1), ["timestamp", *rad_cols]]
    else:
        rad = df.iloc[0:0][["timestamp"]]

    return elec.copy(), rad.copy()


def _resample(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    """Resamplea un flujo a `interval`. Metodo por columna via schemas.agg_method().

    Agrega n_muestras (filas crudas por ventana) e intervalo_original_seg (mediana
    del paso original, util para saber la cadencia nativa de cada tramo). Descarta
    ventanas vacias -> no fabrica filas al bajar a 15 s data mas gruesa.
    """
    measures = [c for c in df.columns if c != "timestamp"]
    if df.empty or not measures:
        return pd.DataFrame(columns=["timestamp", *measures, "n_muestras", "intervalo_original_seg"])

    out = df.set_index("timestamp").sort_index()
    intervalo = out.index.to_series().diff().dt.total_seconds().median()

    agg = {col: agg_method(col) for col in out.columns}
    res = out.resample(interval).agg(agg)
    res["n_muestras"] = out.resample(interval).size()
    res["intervalo_original_seg"] = round(intervalo) if pd.notna(intervalo) else None

    res = res[res["n_muestras"] > 0].reset_index()
    return res


def transform_file(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Extraido -> (electrico 5 min, radiacion 15 s), ambos CRUDO. Sella fuente_archivo."""
    fuente = df["fuente_archivo"].iloc[0] if "fuente_archivo" in df.columns and len(df) else None

    elec_raw, rad_raw = split_streams(df)
    elec = _resample(elec_raw, config.RESAMPLE_ELECTRICO)
    rad = _resample(rad_raw, config.RESAMPLE_RADIACION)

    for frame in (elec, rad):
        if not frame.empty:
            frame["fuente_archivo"] = fuente

    logger.info(
        "Transformado -> electrico %d filas (5 min), radiacion %d filas (15 s)",
        len(elec), len(rad),
    )
    return elec, rad

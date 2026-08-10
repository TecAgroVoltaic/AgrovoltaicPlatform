"""Capa de calibracion/QC de radiacion: poblar el clear-sky de referencia.

Rellena `radiacion_sc_clearsky` (timestamp -> cs_ghi_wm2) para los timestamps de
`radiacion_sc_15s` que aun no lo tengan. Es la unica parte que necesita Python
(pvlib no corre en SQL); el resto (kt*, qc_ok, W/m2) se deriva en la vista
`v_sc_radiacion_calibrada`. Idempotente e incremental.
"""

from __future__ import annotations

import logging

import pandas as pd
import psycopg

from . import clearsky, config

logger = logging.getLogger(__name__)


def refresh_clearsky(conn: psycopg.Connection, full: bool = False) -> int:
    """Calcula cs_ghi para los timestamps de radiacion faltantes y los upsertea.

    full=True recalcula todos; si no, solo los que no estan en la tabla clear-sky.
    Devuelve el nº de filas calculadas.
    """
    with conn.cursor() as cur:
        if full:
            cur.execute(f"SELECT timestamp FROM {config.TABLE_RADIACION} ORDER BY timestamp")
        else:
            cur.execute(
                f"SELECT r.timestamp FROM {config.TABLE_RADIACION} r "
                f"LEFT JOIN {config.TABLE_CLEARSKY} c USING (timestamp) "
                f"WHERE c.timestamp IS NULL ORDER BY r.timestamp"
            )
        ts = [row[0] for row in cur.fetchall()]

    if not ts:
        logger.info("clear-sky: nada que calcular (al dia)")
        return 0

    ghi = clearsky.cs_ghi_for(pd.DatetimeIndex(ts))
    rows = [
        (t, None if pd.isna(g) else float(g))
        for t, g in zip(ts, ghi.to_numpy())
    ]
    with conn.cursor() as cur:
        cur.executemany(
            f"INSERT INTO {config.TABLE_CLEARSKY} (timestamp, cs_ghi_wm2) VALUES (%s, %s) "
            f"ON CONFLICT (timestamp) DO UPDATE SET cs_ghi_wm2 = EXCLUDED.cs_ghi_wm2",
            rows,
        )
    logger.info("clear-sky: %d timestamps calculados/actualizados", len(rows))
    return len(rows)

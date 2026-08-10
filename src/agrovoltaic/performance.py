"""POA por arreglo (frontal + bifacial) para el Performance Ratio.

Transpone la GHI medida (celda horizontal) al plano de cada arreglo con pvlib
(descomposicion Erbs + transposicion isotropica), usando el ALBEDO MEDIDO para el
reflejo del suelo. Modelo bifacial de dos planos:

    POA_efectiva = POA_frontal + phi * POA_trasera

donde la trasera es el plano opuesto (tilt'=180-tilt, az'=az+180) y phi el factor de
bifacialidad. Puebla `radiacion_sc_poa` (idempotente). Es la parte Python del PR; el
PR en si se deriva en la vista v_sc_performance.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
import psycopg
import pvlib

from . import clearsky, config

logger = logging.getLogger(__name__)


def poa_por_arreglo(times_local: pd.DatetimeIndex, ghi, albedo) -> dict[str, np.ndarray]:
    """Devuelve {pvX_front, pvX} (W/m2) para cada arreglo. times_local = tz-aware CR."""
    ghi = np.asarray(ghi, dtype=float)
    alb = np.asarray(albedo, dtype=float)
    alb = np.where((alb >= 0.05) & (alb <= 0.9), alb, 0.2)  # albedo plausible, si no 0.2

    sp = pvlib.solarposition.get_solarposition(
        times_local, config.SITE_LAT, config.SITE_LON, altitude=config.SITE_ALT)
    zen, saz = sp["apparent_zenith"].values, sp["azimuth"].values
    erbs = pvlib.irradiance.erbs(ghi, zen, times_local.dayofyear)
    dni, dhi = erbs["dni"], erbs["dhi"]

    def _poa(tilt, az):
        return np.asarray(pvlib.irradiance.get_total_irradiance(
            tilt, az % 360, zen, saz, dni=dni, ghi=ghi, dhi=dhi,
            albedo=alb, model="isotropic")["poa_global"])

    out: dict[str, np.ndarray] = {}
    for name, g in config.PV_ARRAYS.items():
        front = _poa(g["tilt"], g["az"])
        rear = _poa(180 - g["tilt"], g["az"] + 180)
        out[f"{name}_front"] = front
        out[name] = front + config.PHI_BIFACIAL * rear  # POA efectiva bifacial
    return out


def refresh_poa(conn: psycopg.Connection, full: bool = False) -> int:
    """Calcula la POA por arreglo de los timestamps validos faltantes y los upsertea."""
    base = (
        f"SELECT timestamp, irradiancia_incidente_wm2, albedo "
        f"FROM {config.VIEW_RADIACION_CAL} "
        f"WHERE valido AND qc_ok AND irradiancia_incidente_wm2 IS NOT NULL"
    )
    with conn.cursor() as cur:
        if full:
            cur.execute(base + " ORDER BY timestamp")
        else:
            cur.execute(
                base + f" AND timestamp NOT IN (SELECT timestamp FROM {config.TABLE_POA}) "
                "ORDER BY timestamp"
            )
        rows = cur.fetchall()

    if not rows:
        logger.info("POA: nada que calcular (al dia)")
        return 0

    ts = [r[0] for r in rows]
    ghi = [r[1] for r in rows]
    alb = [r[2] for r in rows]
    local = clearsky._to_local(pd.DatetimeIndex(ts))
    poa = poa_por_arreglo(local, ghi, alb)

    def _f(v):
        return None if (v is None or not np.isfinite(v)) else float(v)

    data = [
        (t, _f(poa["pv1_front"][i]), _f(poa["pv1"][i]),
         _f(poa["pv2_front"][i]), _f(poa["pv2"][i]))
        for i, t in enumerate(ts)
    ]
    with conn.cursor() as cur:
        cur.executemany(
            f"INSERT INTO {config.TABLE_POA} "
            "(timestamp, poa_pv1_front_wm2, poa_pv1_wm2, poa_pv2_front_wm2, poa_pv2_wm2) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (timestamp) DO UPDATE SET "
            "poa_pv1_front_wm2=EXCLUDED.poa_pv1_front_wm2, poa_pv1_wm2=EXCLUDED.poa_pv1_wm2, "
            "poa_pv2_front_wm2=EXCLUDED.poa_pv2_front_wm2, poa_pv2_wm2=EXCLUDED.poa_pv2_wm2",
            data,
        )
    logger.info("POA: %d timestamps calculados/actualizados", len(data))
    return len(data)

"""Clear-sky GHI teorico con pvlib (Ineichen + turbidez Linke climatologica).

Mismo modelo que usa el agente de pronostico (agente-pronostico/.../physics.py).
Sirve de referencia para calibrar/QC la irradiancia: kt* = medido / clear-sky.

OJO CON EL TIMEZONE: los timestamps de la tabla de radiacion son el **reloj de
pared LOCAL** de Costa Rica guardado como UTC (naive -> UTC en la ingesta). Para
que la posicion solar sea correcta hay que reinterpretar ese reloj de pared como
America/Costa_Rica, no como UTC. cs_ghi_for() lo hace.
"""

from __future__ import annotations

import pandas as pd
from pvlib.location import Location

from . import config


def _to_local(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """Reinterpreta el reloj de pared del timestamp almacenado como hora local CR."""
    idx = pd.DatetimeIndex(index)
    if idx.tz is not None:
        idx = idx.tz_localize(None)          # descartar el +00 falso -> reloj de pared
    return idx.tz_localize(config.SITE_TZ, ambiguous="NaT", nonexistent="NaT")


def cs_ghi_for(timestamps) -> pd.Series:
    """GHI de cielo despejado (W/m2) para cada timestamp almacenado.

    Devuelve una Serie indexada por los timestamps ORIGINALES (tal como vinieron),
    para poder re-insertarla con la misma PK que radiacion_sc_15s.
    """
    orig = pd.DatetimeIndex(timestamps)
    local = _to_local(orig)
    loc = Location(
        latitude=config.SITE_LAT, longitude=config.SITE_LON,
        altitude=config.SITE_ALT, tz=config.SITE_TZ,
    )
    ghi = loc.get_clearsky(local)["ghi"]  # Ineichen + Linke climatologica (default)
    ghi.index = orig
    return ghi

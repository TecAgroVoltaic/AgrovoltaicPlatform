"""Ventana solar por dia — contra que se mide "el dia esta completo".

El logger de San Carlos SOLO graba de dia: los dias sanos cubren entre 11,5 y 12,7
horas. Medir la completitud contra 24 h daria un 50 % permanente y no diria nada.
Se mide contra las horas de sol reales, que dependen de la fecha y del sitio.

`radiacion_sc_clearsky` no sirve para esto: solo tiene timestamps donde YA hay
dato, asi que no puede decir cuando DEBERIA haberlo habido. De ahi esta tabla.

OJO CON EL TIMEZONE (misma trampa que en src/agrovoltaic/clearsky.py): los
timestamps del store son el reloj de pared LOCAL guardado como si fuera UTC. Aca
se calcula en hora local y se re-etiqueta igual, para que amanecer/atardecer sean
comparables con los timestamps almacenados sin conversiones a mitad de camino.
"""
from __future__ import annotations

from datetime import date

import pandas as pd
from pvlib.location import Location

from comparador import config, db

_UPSERT = """
    INSERT INTO ventana_solar (fecha, amanecer, atardecer, horas_sol)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (fecha) DO UPDATE
       SET amanecer = EXCLUDED.amanecer,
           atardecer = EXCLUDED.atardecer,
           horas_sol = EXCLUDED.horas_sol
"""


def calcular(desde: date, hasta: date) -> pd.DataFrame:
    """Amanecer/atardecer/horas de sol por dia en [desde, hasta], ambos inclusive.

    Devuelve un DataFrame con el reloj de pared local etiquetado como UTC, que es
    la convencion del store (ver el docstring del modulo).
    """
    if hasta < desde:
        raise ValueError(f"rango invalido: {desde} > {hasta}")

    loc = Location(config.SITE_LAT, config.SITE_LON, tz=config.TZ, altitude=config.SITE_ALT)
    dias = pd.date_range(desde, hasta, freq="D", tz=config.TZ)
    sol = loc.get_sun_rise_set_transit(dias)

    # De hora local a "reloj de pared etiquetado UTC", la convencion del store.
    amanecer = sol["sunrise"].dt.tz_localize(None).dt.tz_localize("UTC")
    atardecer = sol["sunset"].dt.tz_localize(None).dt.tz_localize("UTC")

    return pd.DataFrame({
        "fecha": [d.date() for d in dias],
        "amanecer": amanecer.values,
        "atardecer": atardecer.values,
        "horas_sol": (atardecer - amanecer).dt.total_seconds().values / 3600.0,
    })


def poblar(desde: date, hasta: date) -> int:
    """Calcula y guarda la ventana solar del rango. Idempotente."""
    tabla = calcular(desde, hasta)
    # Al segundo: pvlib devuelve nanosegundos y el sub-segundo en un amanecer no
    # significa nada. Ademas evita el warning al convertir a datetime de Python.
    filas = [
        (r.fecha,
         pd.Timestamp(r.amanecer).round("s").to_pydatetime(),
         pd.Timestamp(r.atardecer).round("s").to_pydatetime(),
         float(r.horas_sol))
        for r in tabla.itertuples()
    ]
    return db.ejecutar_muchos(_UPSERT, filas)

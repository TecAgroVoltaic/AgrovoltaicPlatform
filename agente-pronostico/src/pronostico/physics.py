"""
Fisica del pronostico de irradiancia.

Tres funciones puras, sin estado ni acceso a datos, reutilizables por los
forecasters y los scripts. La idea de fondo (descomposicion por cielo despejado):

    GHI_medida = kt* x GHI_cieloclaro

donde kt* (indice de cielo despejado) aisla el efecto de las NUBES del efecto,
perfectamente predecible, de la GEOMETRIA SOLAR. Pronosticar kt* (suave) es mucho
mas facil que pronosticar GHI directo (domina la parabola diurna del sol).

Convencion: todos los `times` deben ser DatetimeIndex tz-aware (America/Costa_Rica).
"""
from __future__ import annotations

import pandas as pd
from pvlib.location import Location


def clear_sky_ghi(times, lat: float, lon: float, alt: float, tz: str) -> pd.Series:
    """GHI de cielo despejado [W/m2] con el modelo Ineichen (turbidez Linke
    climatologica) de pvlib. Es puramente ASTRONOMICO: depende solo del tiempo y
    la posicion, no de los datos medidos -> conocerlo en t_now+h NO es fuga.

    times: DatetimeIndex tz-aware (o algo convertible). Devuelve Serie indexada igual.
    """
    idx = pd.DatetimeIndex(times)
    loc = Location(latitude=lat, longitude=lon, altitude=alt, tz=tz)
    return loc.get_clearsky(idx)["ghi"]


def clear_sky_index(ghi_medida: pd.Series, ghi_cs: pd.Series,
                    umbral_cs: float = 20.0) -> pd.Series:
    """kt* = GHI_medida / GHI_cieloclaro, SOLO donde GHI_cieloclaro > umbral_cs.

    El umbral (por defecto 20 W/m2) evita dividir por ~0 al amanecer/anochecer y
    de noche, donde kt* no tiene sentido. Se recorta a >= 0 (una medida negativa
    por offset del sensor no debe producir kt* negativo).
    """
    g_med, g_cs = ghi_medida.align(ghi_cs, join="inner")
    mask = g_cs > umbral_cs
    kt = (g_med[mask] / g_cs[mask]).clip(lower=0)
    return kt


def reconstruct_ghi(ktstar, ghi_cs):
    """Reconstruye GHI = kt* x GHI_cieloclaro. Acepta escalares o Series.

    Se usa al pronosticar: kt*_pred (constante en persistencia) x cielo despejado
    en el instante futuro devuelve el GHI pronosticado con la geometria solar ya
    incorporada.
    """
    return ktstar * ghi_cs

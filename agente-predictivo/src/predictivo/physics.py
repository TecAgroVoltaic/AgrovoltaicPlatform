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


def mezcla_convexa(reciente, clima_reciente, clima_objetivo, peso):
    """kt* a persistir = clima_objetivo + peso x (reciente - clima_reciente).

    Escalares o Series. Aplica DOS correcciones independientes a la persistencia,
    y conviene verlas por separado porque arreglan cosas distintas:

    1. AJUSTE DIURNO (los dos climas). Lo que persiste no es el kt* crudo sino la
       ANOMALIA respecto de lo normal a esa hora, transplantada a lo normal de la
       hora objetivo. Sin esto, persistir la manana hacia la tarde ignora que en
       San Carlos las tardes se cierran por conveccion: kt* medio 0,58 a las 11 h
       y 0,35 a las 16 h. Medido, ese solo defecto producia +52 % de sesgo a las
       16 h y -21 % a las 11 h, a 3 h de anticipacion.

    2. CONTRACCION (el peso). Persistir supone que la nubosidad de AHORA sigue
       valiendo dentro de h, y eso solo vale mientras kt* siga correlacionado
       consigo mismo. Medido: 0,90 (5 min) -> 0,52 (1 h) -> 0,31 (3 h) -> 0,13
       (6 h). A 6 h la persistencia pura conserva el 100 % de la anomalia cuando
       solo un 13 % esta justificado, y sale un pronostico sobre-disperso. El
       peso que minimiza el error cuadratico es justamente esa correlacion; es el
       estandar de referencia del pronostico solar, no una heuristica local.

    Casos limite:
      peso = 1 y clima_reciente == clima_objetivo -> persistencia pura (el
        comportamiento historico, byte por byte)
      peso = 0 -> climatologia pura (no se le cree nada a lo reciente)

    El peso y los climas se DERIVAN de la serie en `forecasters.climatologia`, no
    se declaran.
    """
    return clima_objetivo + peso * (reciente - clima_reciente)

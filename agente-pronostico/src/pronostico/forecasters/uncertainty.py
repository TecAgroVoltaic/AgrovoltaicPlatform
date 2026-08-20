"""
Incertidumbre del pronostico: cuanto se suele errar A ESE HORIZONTE.

El defecto que este modulo vino a cerrar
----------------------------------------
La banda anterior (`banda_sigma`) era +-1 sigma de los kt* de la ultima hora. Eso
mide cuanto VARIO el cielo recien, que no es lo mismo que cuanto puede ERRAR un
pronostico a 3 h. Como la ventana siempre dura lo mismo, la banda salia siempre
igual de ancha aunque el error real creciera con el horizonte. Medido sobre 78
dias, la cobertura empirica (deberia rondar el 68 %):

    horizonte     30 min   1 h    2 h    3 h    6 h
    cobertura      42 %    38 %   33 %   29 %   24 %
    ancho banda    158     162    166    165    133   W/m2
    RMSE real      169     188    216    237    236   W/m2

O sea: el ancho clavado mientras el error se duplicaba, y tres de cada cuatro
veces la realidad caia fuera. Aunque el valor central no se tocara, eso solo ya
hace que el pronostico se lea como "muy lejos": promete una precision que no
tiene.

La banda de aca sale de los CUANTILES 16-84 del error real del metodo a ese
horizonte, medidos sobre el pasado (`climatologia.cuantiles_error`). Calibrada en
la primera mitad de la serie y evaluada en la segunda, cubre entre 71 y 76 % en
todos los horizontes, y crece con el horizonte porque el error crece.
"""
from __future__ import annotations

import pandas as pd

from pronostico.domain import Variable
from pronostico.forecasters import climatologia
from pronostico.physics import reconstruct_ghi


def banda_empirica(kt_hat: float, cs_target: float, horizonte_seg: int,
                   variable: str = Variable.IRRADIANCIA.value,
                   antes_de=None, kt_ventana: pd.Series | None = None,
                   regimen: str | None = None) -> tuple[float, float, str]:
    """Banda de incertidumbre en GHI [W/m2] para `horizonte_seg`.

    kt_hat      : kt* que se va a persistir SIN la correccion de centro. Los
                  cuantiles se midieron contra ese valor, asi que la banda se
                  ancla ahi; el punto reportado va centrado y queda adentro.
    cs_target   : techo de cielo despejado en el instante objetivo.
    kt_ventana  : kt* recientes, SOLO como respaldo si no hay historia para medir
                  los cuantiles (sitio nuevo, serie corta).
    regimen     : como venia el cielo ('calmo'|'medio'|'turbulento'). Con el, la
                  banda se mide sobre momentos comparables: mas angosta cuando el
                  cielo esta quieto, mas ancha cuando se mueve. Ver el modulo
                  `riesgo` y el docstring de `climatologia.cuantiles_error`.

    Devuelve (bajo, alto, origen). `origen` viaja porque una banda de respaldo y
    una banda calibrada no valen lo mismo, y quien la muestre tiene que poder
    decirlo en vez de presentarlas como equivalentes.
    """
    cuantiles = climatologia.cuantiles_error(horizonte_seg, variable, antes_de,
                                             regimen=regimen)
    if cuantiles is not None:
        q_bajo, _q_centro, q_alto = cuantiles
        lo = max(0.0, float(reconstruct_ghi(kt_hat + q_bajo, cs_target)))
        hi = float(reconstruct_ghi(kt_hat + q_alto, cs_target))
        origen = "cuantiles-historicos"
        if regimen:
            origen += f"-{regimen}"
        return lo, hi, origen

    if kt_ventana is None or kt_ventana.empty:
        return float(kt_hat * cs_target), float(kt_hat * cs_target), "sin-banda"
    lo, hi = banda_sigma(kt_ventana, kt_hat, cs_target)
    return lo, hi, "sigma-reciente"


def banda_sigma(kt: pd.Series, kt_bar: float, cs_target: float) -> tuple[float, float]:
    """RESPALDO: banda de +-1 sigma de kt* reciente, reconstruida a GHI [W/m2].

    Se conserva por dos razones concretas, no por inercia: `humidity.py` la usa
    (el suelo no tiene techo ni climatologia horaria) y es la unica banda posible
    cuando todavia no hay historia para medir cuantiles. Sub-estima la
    incertidumbre a horizontes largos; ver el docstring del modulo.

    kt        : kt* recientes (indice de cielo despejado del lookback).
    kt_bar    : el kt* que se persiste (el centro de la banda).
    cs_target : GHI de cielo despejado en el instante objetivo.
    """
    sigma = float(kt.std(ddof=0)) if len(kt) > 1 else 0.0
    lo = max(0.0, float(reconstruct_ghi(kt_bar - sigma, cs_target)))
    hi = float(reconstruct_ghi(kt_bar + sigma, cs_target))
    return lo, hi

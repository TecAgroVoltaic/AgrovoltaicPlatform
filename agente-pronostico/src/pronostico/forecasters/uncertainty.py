"""
Incertidumbre del pronostico — banda heuristica.

Extrae, en un solo lugar reutilizable, la banda de incertidumbre que antes estaba
embebida en `smart_persistence`. Hoy: banda de +-1 sigma de kt* reciente,
reconstruida a GHI con la geometria solar del instante objetivo. Manana (fase 2):
intervalos conformales (MAPIE) detras de la misma firma.

La banda captura la variabilidad reciente de las nubes: cuanto mas dispersos los
kt* de la ultima hora, mas ancha la banda.
"""
from __future__ import annotations

import pandas as pd

from pronostico.physics import reconstruct_ghi


def banda_sigma(kt: pd.Series, kt_bar: float, cs_target: float) -> tuple[float, float]:
    """Banda de +-1 sigma de kt* reciente, reconstruida a GHI [W/m2].

    kt        : kt* recientes (indice de cielo despejado del lookback).
    kt_bar    : MEDIANA de esos kt* (el kt* pronosticado por persistencia).
    cs_target : GHI de cielo despejado en el instante objetivo (now + horizonte).

    Devuelve (bajo, alto). El extremo bajo se recorta a 0 (no hay GHI negativa).
    """
    sigma = float(kt.std(ddof=0)) if len(kt) > 1 else 0.0
    lo = max(0.0, float(reconstruct_ghi(kt_bar - sigma, cs_target)))
    hi = float(reconstruct_ghi(kt_bar + sigma, cs_target))
    return lo, hi

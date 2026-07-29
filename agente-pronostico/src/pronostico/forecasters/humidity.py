"""
Forecaster de humedad de suelo (lectura CRUDA, ADC).

A diferencia de la irradiancia, el suelo NO tiene analogo de cielo-despejado (eso
es solar) y su humedad cambia LENTO: es muy autocorrelacionada a horizontes
cortos. El baseline honesto es PERSISTIR la mediana reciente (robusta a un dato
atipico). El `horizon_seconds` no altera el valor central (como el naive), pero la
banda de incertidumbre se ensancha con la variabilidad reciente.

Sin fuga: solo consume lecturas con timestamp < now (via get_recent_data).
"""
from __future__ import annotations

import pandas as pd

from pronostico import data as _data
from pronostico.domain import Variable

# Minimo de lecturas recientes para animarse a persistir. Con menos, "no se"
# (NaN) en vez de un numero armado con casi nada.
MIN_MUESTRAS_HUM = 3


def humidity_persistence(now, horizon_seconds, lookback_min: float = 60,
                         get_recent=None, retornar_banda: bool = False):
    """Persistencia de la humedad de suelo: MEDIANA de las lecturas recientes.

    Devuelve float (lectura cruda). Con retornar_banda=True devuelve (pred, lo, hi),
    banda de +-1 sigma de la variabilidad reciente. `horizon_seconds` se acepta por
    simetria de firma con los otros forecasters; no cambia el valor central.
    """
    get_recent = get_recent or (
        lambda n, lb: _data.get_recent_data(n, lb, Variable.HUMEDAD_SUELO.value))
    now = pd.Timestamp(now)
    recientes = get_recent(now, lookback_min)                 # lecturas < now
    _nan = (float("nan"),) * 3 if retornar_banda else float("nan")
    if recientes.empty or len(recientes) < MIN_MUESTRAS_HUM:
        return _nan

    val = float(recientes.median())
    if retornar_banda:
        sigma = float(recientes.std(ddof=0)) if len(recientes) > 1 else 0.0
        return val, val - sigma, val + sigma
    return val

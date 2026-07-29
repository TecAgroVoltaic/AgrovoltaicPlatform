"""
Forecasters de persistencia para irradiancia (GHI).

Dos modelos que comparten firma `(now, horizon_seconds, ...)` y devuelven el GHI
pronosticado [W/m2] para el instante now+horizon. Ambos son estrictamente SIN FUGA:
solo consumen datos medidos con timestamp < now (via get_recent_data).

  smart_persistence  -> persiste kt* (indice de cielo despejado) y lo re-expande
                        con la geometria solar del futuro. El rival "listo".
  naive_persistence  -> persiste el ULTIMO GHI crudo. El rival tonto (ignora el sol).

La banda de incertidumbre de smart_persistence vive en `uncertainty.banda_sigma`.
"""
from __future__ import annotations

import pandas as pd

from pronostico import config, data as _data
from pronostico.physics import clear_sky_ghi, clear_sky_index, reconstruct_ghi
from pronostico.forecasters.uncertainty import banda_sigma


def _cs_default(times):
    """Cielo despejado en el sitio configurado (San Carlos)."""
    return clear_sky_ghi(times, **_data.SITE)


# Minimo de kt* diurnos utiles en el lookback para animarse a pronosticar. Con
# menos, la estimacion es demasiado fragil (1-2 lecturas ruidosas la dominarian):
# se devuelve NaN ("no se") en vez de un numero armado con casi nada.
MIN_MUESTRAS = 3


def smart_persistence(now, horizon_seconds, lookback_min: float = 60,
                      umbral_cs: float | None = None, get_recent=None,
                      clear_sky_fn=None, retornar_banda: bool = False):
    """Persistencia INTELIGENTE del indice de cielo despejado kt*.

    Receta:
      1. kt* de los ultimos `lookback_min` (SOLO lecturas < now).
      2. kt*_pred = MEDIANA de esos kt* (robusta; se asume que las nubes persisten).
      3. GHI_pred(now+h) = kt*_pred x GHI_cieloclaro(now+h).

    El paso 3 mete la geometria solar del FUTURO (astronomica, licita): si now+h
    cae mas cerca del mediodia el pronostico sube aunque las nubes no cambien; si
    cae al atardecer, baja. Eso es justo lo que la persistencia ingenua no sabe.

    Sin fuga: los kt* salen de get_recent (timestamp < now); el cielo despejado
    en now+h no usa ningun dato medido.

    Devuelve float (GHI [W/m2]). Con retornar_banda=True devuelve (pred, lo, hi),
    una banda heuristica de +-1 sigma de kt* sobre el lookback (incertidumbre por
    variabilidad reciente de nubes).
    """
    get_recent = get_recent or _data.get_recent_data
    clear_sky_fn = clear_sky_fn or _cs_default
    umbral_cs = config.UMBRAL_CS if umbral_cs is None else umbral_cs

    now = pd.Timestamp(now)
    recientes = get_recent(now, lookback_min)            # GHI medida, estrictamente < now
    _nan = (float("nan"),) * 3 if retornar_banda else float("nan")
    if recientes.empty:
        return _nan

    cs_reciente = clear_sky_fn(recientes.index)          # cielo despejado en esos instantes
    kt = clear_sky_index(recientes, cs_reciente, umbral_cs)
    if len(kt) < MIN_MUESTRAS:           # ventana nocturna o con muy pocos kt* utiles
        return _nan

    # MEDIANA (no media): un pico de reflejo o una lectura atipica de la ultima
    # hora no arrastran el kt* pronosticado.
    kt_bar = float(kt.median())
    t_target = now + pd.Timedelta(seconds=horizon_seconds)
    cs_target = float(clear_sky_fn(pd.DatetimeIndex([t_target])).iloc[0])
    pred = float(reconstruct_ghi(kt_bar, cs_target))

    if retornar_banda:
        lo, hi = banda_sigma(kt, kt_bar, cs_target)
        return pred, lo, hi
    return pred


def naive_persistence(now, horizon_seconds, lookback_min: float = 60, get_recent=None):
    """Persistencia INGENUA: GHI_pred(now+h) = ULTIMO GHI medido antes de now.

    Ignora que el sol se mueve; `horizon_seconds` se acepta por simetria de firma
    pero no altera el valor. Por eso se degrada tanto en horizontes largos y cerca
    del amanecer/atardecer (predice "lo mismo de hace rato" cuando el sol cambio).
    """
    get_recent = get_recent or _data.get_recent_data
    now = pd.Timestamp(now)
    recientes = get_recent(now, lookback_min)
    if recientes.empty:
        return float("nan")
    return float(recientes.iloc[-1])                     # ultima lectura con timestamp < now

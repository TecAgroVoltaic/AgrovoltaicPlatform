"""Backtest honesto: reaplica el METODO del forecaster sobre el historico del store
y lo compara con lo medido. Responsabilidad unica: evaluar el metodo, no predecir.

IMPORTANTE: esto NO son predicciones que el agente hizo en vivo (esas viven en la
tabla de auditoria `predicciones`, solo las que se dispararon). Es una reconstruccion
para responder "que tan bueno es el metodo" sobre datos que ya pasaron.

  Irradiancia   -> persistencia del indice de claridad kt* proyectada al cielo despejado.
  Humedad suelo -> persistencia del valor (el suelo cambia lento).
"""
from __future__ import annotations

import pandas as pd

from pronostico import config, data
from pronostico.domain import Variable
from pronostico.physics import clear_sky_ghi

_BUCKETS = {"15min", "30min", "h", "D"}


def backtest(variable: str = Variable.IRRADIANCIA.value, dias: int = 7,
             bucket: str = "h") -> dict:
    """Reconstruye pred vs real sobre los ultimos `dias` del store, a cadencia `bucket`."""
    if bucket not in _BUCKETS:
        raise ValueError(f"bucket invalido: {bucket!r} ({', '.join(sorted(_BUCKETS))})")

    serie = data.cargar_serie(variable)                 # tz-aware (hora local CR)
    corte = serie.index.max() - pd.Timedelta(days=int(dias))
    s = serie[serie.index >= corte].resample(bucket).mean().dropna()
    if len(s) < 3:
        raise ValueError("serie insuficiente para backtest en ese rango")

    if variable == Variable.IRRADIANCIA.value:
        cs = clear_sky_ghi(s.index, **data.SITE)        # techo fisico por bucket
        um = config.UMBRAL_CS
        kt = (s / cs).where(cs > um)                    # kt* (NaN de noche)
        pred = kt.shift(1) * cs                         # persistencia de kt*
        pred = pred.where(cs >= um, 0.0)                # de noche -> 0
        metodo = "persistencia de kt* (indice de claridad) x cielo despejado"
    else:
        cs = None
        pred = s.shift(1)                               # persistencia del valor
        metodo = "persistencia del valor (el suelo cambia lento)"

    naive = s.shift(1)                                   # baseline ingenuo = valor previo
    cols = {"real": s, "pred": pred, "naive": naive}
    if cs is not None:
        cols["cs"] = cs
    df = pd.DataFrame(cols).dropna(subset=["real", "pred", "naive"])
    if df.empty:
        raise ValueError("sin pares (real, pred) tras alinear la serie")

    err = df["pred"] - df["real"]
    mae = float(err.abs().mean())
    bias = float(err.mean())
    avg = float(df["real"].mean())
    mae_naive = float((df["naive"] - df["real"]).abs().mean())
    skill = float((1 - mae / mae_naive) * 100) if mae_naive else 0.0
    fmt_t = "%Y-%m-%d" if bucket == "D" else "%Y-%m-%d %H:%M"

    puntos = []
    for t in df.index:
        p = {"t": t.strftime(fmt_t),
             "real": round(float(df.loc[t, "real"]), 2),
             "pred": round(float(df.loc[t, "pred"]), 2)}
        if cs is not None:
            p["cs"] = round(float(df.loc[t, "cs"]), 2)
        puntos.append(p)

    return {
        "variable": variable, "bucket": bucket, "dias": int(dias), "metodo": metodo,
        "n": int(len(df)),
        "metricas": {
            "mae": round(mae, 2), "bias": round(bias, 2),
            "error_rel_pct": round(mae / avg * 100, 1) if avg else None,
            "skill_pct": round(skill, 1),
        },
        "puntos": puntos,
        "nota": ("BACKTEST: reconstruccion del metodo sobre el historico, NO predicciones "
                 "en vivo. Las predicciones reales del agente estan en la tabla `predicciones`."),
    }

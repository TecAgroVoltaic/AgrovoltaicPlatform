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


def _ts(x) -> pd.Timestamp:
    """Fecha ISO -> Timestamp tz-aware en hora local del sitio (para comparar con el indice)."""
    t = pd.Timestamp(x)
    return t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)


def _dias_con_datos(serie: pd.Series) -> pd.DatetimeIndex:
    """Dias que SI tienen lecturas. La cobertura no es continua: hay huecos de
    dias o meses enteros dentro del rango global."""
    conteo = serie.resample("D").count()
    return conteo[conteo > 0].index


def _mensaje_sin_datos(serie, variable, disp0, disp1, lo, hi) -> str:
    """Explica POR QUE no se pudo evaluar, distinguiendo dos casos muy distintos.

    Antes decia siempre "el store va del X al Y", lo que sugiere cobertura
    continua: pedir un dia que cae en un hueco INTERNO producia un mensaje que
    contradecia al propio rango, y el LLM lo repetia ("esa fecha esta fuera del
    rango" seguido del rango que la contiene).
    """
    base = (f"El store de {variable} va del {disp0.date()} al {disp1.date()}, "
            f"pero la cobertura NO es continua (hay huecos).")
    if lo is None:
        return f"no hay suficientes datos para evaluar ese rango. {base}"
    if lo > disp1 or (hi is not None and hi <= disp0):
        return (f"la fecha pedida ({lo.date()}) esta FUERA del rango de datos. {base}")

    dias = _dias_con_datos(serie)
    previos = dias[dias < lo]
    siguientes = dias[dias >= (hi if hi is not None else lo)]
    sugerencias = [d.date().isoformat() for d in
                   ([previos[-1]] if len(previos) else []) +
                   ([siguientes[0]] if len(siguientes) else [])]
    cerca = f" Dias con datos mas cercanos: {', '.join(sugerencias)}." if sugerencias else ""
    return (f"no hay datos para {lo.date()}: cae en un HUECO de la serie (la fecha si "
            f"esta dentro del rango global, pero ese dia no se registro). {base}{cerca}")


def backtest(variable: str = Variable.IRRADIANCIA.value, dias: int = 7,
             bucket: str = "h", desde: str | None = None,
             hasta: str | None = None) -> dict:
    """Reconstruye pred vs real. Por defecto los ultimos `dias`; si se pasa `desde`
    (y opcional `hasta`), evalua ESE rango historico. Cadencia `bucket`."""
    if bucket not in _BUCKETS:
        raise ValueError(f"bucket invalido: {bucket!r} ({', '.join(sorted(_BUCKETS))})")

    serie = data.cargar_serie(variable)                 # tz-aware (hora local CR)
    disp0, disp1 = serie.index.min(), serie.index.max()

    lo = hi = None                                      # limites del rango pedido
    if desde or hasta:                                  # rango historico explicito
        lo = _ts(desde) if desde else disp0
        if hasta:
            hi = _ts(hasta)
        elif desde:
            hi = lo + pd.Timedelta(days=1)              # un solo dia -> [dia, dia+1)
        else:
            hi = disp1 + pd.Timedelta(seconds=1)
        sel = serie[(serie.index >= lo) & (serie.index < hi)]
    else:                                               # ultimos N dias
        corte = disp1 - pd.Timedelta(days=int(dias))
        sel = serie[serie.index >= corte]

    s = sel.resample(bucket).mean().dropna()
    if len(s) < 3:
        raise ValueError(_mensaje_sin_datos(serie, variable, disp0, disp1, lo, hi))

    if variable == Variable.IRRADIANCIA.value:
        # El techo se PROMEDIA dentro de la franja, igual que la medida. Antes se
        # evaluaba en el borde izquierdo (`clear_sky_ghi(s.index)`), lo que:
        #   - sesgaba las franjas horarias (a las 07:00 usaba el techo del minuto
        #     cero, no el de la hora entera: sube rapido por la manana);
        #   - y ROMPIA bucket='D' por completo, porque el borde de un dia es la
        #     medianoche -> techo 0 -> kt* NaN -> pred 0 TODOS los dias, con
        #     metricas de forma plausible y sentido nulo (skill de -26 %).
        # Comparar la media de lo medido contra la media del techo es lo unico
        # coherente, y funciona en cualquier resolucion.
        cs_nativo = clear_sky_ghi(sel.index, **data.SITE)
        cs = cs_nativo.resample(bucket).mean().reindex(s.index)
        um = config.UMBRAL_CS
        kt = (s / cs).where(cs > um)                    # kt* (NaN de noche)
        pred = kt.shift(1) * cs                         # persistencia de kt*
        pred = pred.where(cs >= um, 0.0)                # de noche -> 0
        metodo = "persistencia del indice de cielo despejado kt* x techo de cielo despejado"
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

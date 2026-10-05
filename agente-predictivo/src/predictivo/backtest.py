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

from predictivo import config, data
from predictivo.domain import Variable
from predictivo.forecasters import climatologia, estimador
from predictivo.physics import clear_sky_ghi

_BUCKETS = {"15min": "15min", "30min": "30min", "h": "1h", "D": "1D"}
_ESTADISTICOS = set(estimador.ESTADISTICOS)


def _describir(estadistico: str, peso: float | None, kt_max: float | None,
               ajuste_diurno: bool, peso_usado: float | None) -> str:
    """Nombre legible del metodo CON su configuracion: si el agente cambia una
    perilla, tiene que verse en la respuesta y no quedar como el mismo metodo."""
    partes = ["persistencia de la anomalia de kt* x techo de cielo despejado"]
    if ajuste_diurno:
        partes.append("ajustada al kt* tipico de la hora objetivo")
    else:
        partes.append("SIN ajuste diurno")
    if peso_usado is not None:
        origen = "elegido" if peso is not None else "derivado de la autocorrelacion"
        partes.append(f"peso {peso_usado:.2f} ({origen})")
    if estadistico != estimador.POR_DEFECTO:
        partes.append(f"resumen por {estadistico}")
    if kt_max is not None:
        partes.append(f"kt* topado en {kt_max:g}")
    return "; ".join(partes)


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
             hasta: str | None = None,
             estadistico: str = estimador.POR_DEFECTO,
             peso: float | None = None, kt_max: float | None = None,
             ajuste_diurno: bool = True) -> dict:
    """Reconstruye pred vs real. Por defecto los ultimos `dias`; si se pasa `desde`
    (y opcional `hasta`), evalua ESE rango historico. Cadencia `bucket`.

    La ANTICIPACION del backtest es el propio `bucket`: cada franja se pronostica
    desde la anterior. Por eso `bucket` no es solo una resolucion de dibujo, es el
    horizonte que se esta evaluando, y de ahi sale el peso que el metodo le da a
    lo reciente.

    El metodo lo aplica `forecasters.estimador`, EL MISMO que corre al predecir en
    vivo. Antes habia dos implementaciones distintas (esta agregaba franjas con
    `ventanas`/`damping`; la de produccion tomaba la mediana de 60 min), asi que
    el agente razonaba con la teoria de un metodo y se lo evaluaba con otro. Las
    perillas de aca son ahora las mismas de alla:

      estadistico    como se resume lo reciente ('ewma' por defecto).
      peso           cuanto se le cree a lo reciente, de 0 a 1. None = derivado de
                     la autocorrelacion de kt* a este horizonte (lo recomendado).
      kt_max         tope superior de kt*. Medido: mueve el MAE menos de
                     0,5 W/m2. Se conserva por completitud, no porque decida algo.
      ajuste_diurno  si la anomalia se transplanta al kt* tipico de la hora
                     objetivo. False reproduce el metodo viejo y solo sirve para
                     comparar (ver scripts/calibrar.py).
    """
    if bucket not in _BUCKETS:
        raise ValueError(f"bucket invalido: {bucket!r} ({', '.join(sorted(_BUCKETS))})")
    if estadistico not in _ESTADISTICOS:
        raise ValueError(f"estadistico invalido: {estadistico!r} "
                         f"({', '.join(sorted(_ESTADISTICOS))})")
    if peso is not None and not 0.0 <= peso <= 1.0:
        raise ValueError(f"peso fuera de [0,1]: {peso!r}")

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

    # SIN dropna: la rejilla tiene que quedar REGULAR para que `shift(1)` signifique
    # "la franja anterior" y no "la anterior que casualmente tuvo datos". Con un
    # hueco de dias en el medio, lo segundo compara franjas separadas por semanas.
    # Los NaN se descartan recien al alinear (real, pred, naive) mas abajo.
    s = sel.resample(bucket).mean()
    if int(s.notna().sum()) < 3:
        raise ValueError(_mensaje_sin_datos(serie, variable, disp0, disp1, lo, hi))

    horizonte_seg = int(pd.Timedelta(_BUCKETS[bucket]).total_seconds())
    corte_datos = sel.index.min() if not sel.empty else disp0
    peso_usado = None

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
        peso_usado = (peso if peso is not None
                      else climatologia.peso_persistencia(horizonte_seg, variable,
                                                          corte_datos))
        # shift(1): lo que se sabia ANTES de la franja. El estimador ya devuelve
        # "el kt* que llevaria a t + horizonte"; correrlo una franja lo ancla en la
        # que se esta evaluando. Ahi esta la barrera anti-fuga del backtest.
        kt_usado = estimador.kt_a_persistir_serie(
            kt, horizonte_seg, variable=variable, antes_de=corte_datos,
            estadistico=estadistico, peso=peso, kt_max=kt_max,
            ajuste_diurno=ajuste_diurno).shift(1)
        pred = kt_usado * cs                            # de vuelta a W/m2
        pred = pred.where(cs >= um, 0.0)                # de noche -> 0
        metodo = _describir(estadistico, peso, kt_max, ajuste_diurno, peso_usado)
    else:
        cs = None
        # El suelo no tiene techo ni ciclo diurno propio: se persiste el valor.
        pred = estimador.kt_a_persistir_serie(
            s, horizonte_seg, variable=variable, antes_de=corte_datos,
            estadistico=estadistico, peso=peso, ajuste_diurno=False).shift(1)
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
        "anticipacion_seg": horizonte_seg,
        "peso_lo_reciente": None if peso_usado is None else round(float(peso_usado), 3),
        "metricas": {
            "mae": round(mae, 2), "bias": round(bias, 2),
            "error_rel_pct": round(mae / avg * 100, 1) if avg else None,
            "skill_pct": round(skill, 1),
        },
        "puntos": puntos,
        "nota": ("BACKTEST: reconstruccion del metodo sobre el historico, NO predicciones "
                 "en vivo. Las predicciones reales del agente estan en la tabla `predicciones`."),
    }

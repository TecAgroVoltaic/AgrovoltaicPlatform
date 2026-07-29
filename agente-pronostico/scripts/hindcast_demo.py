"""
Hindcast (backtest de reloj simulado) de los forecasters de persistencia.

Idea del reloj simulado: nos paramos en muchos instantes t_now DE DIA dentro de
la ventana usable, tapamos el futuro (el forecaster solo ve datos < t_now) y le
pedimos que pronostique el GHI a varios horizontes h. Luego destapamos el REAL
medido en t_now+h y medimos el error. Asi sabemos, ANTES de meter un LLM, cuanto
vale la pena batir: el rival "listo" (smart) vs el tonto (naive).

Metricas por horizonte:
  MAE, RMSE  y  SKILL = 1 - MAE_smart / MAE_naive   (>0 => smart le gana a naive)

SIN FUGA: el forecaster consume get_recent_data (timestamp < t_now). El cielo
despejado en t_now+h SI es licito (astronomico). El hindcast, como EVALUADOR, si
puede mirar el real de t_now+h para calcular el error (eso no es fuga del modelo).

Solo lectura: no toca la DB (usa el parquet cacheado por data.py). Genera PNGs en
docs/pronostico/img/. Requiere AGRODASH_PASSWORD solo si el cache no existe aun.
"""
from __future__ import annotations

from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # backend sin ventana: solo guardamos imagenes
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from pronostico import data, physics
from pronostico.forecasters import naive_persistence, smart_persistence

# --- Parametros del backtest ------------------------------------------------
HORIZONTES_MIN = [30, 60, 120, 180]                       # 30min, 1h, 2h, 3h
ETIQUETA_H = {30: "30min", 60: "1h", 120: "2h", 180: "3h"}
HORAS_DIA = range(7, 17)                                    # t_now a las 7h..16h (de dia)
LOOKBACK_MIN = 60                                          # ventana para el kt* de smart
TOL_REAL = pd.Timedelta(minutes=4)                        # match del real (cadencia ~5.5min)
UMBRAL_CS = data.UMBRAL_CS                                 # target de dia (evita evaluar de noche)

# Imagenes dentro del propio proyecto (self-contained).
IMG = Path(__file__).resolve().parents[1] / "docs" / "pronostico" / "img"
IMG.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
def construir_cache_clearsky(serie: pd.Series, t_nows: pd.DatetimeIndex) -> callable:
    """Precomputa el cielo despejado en TODOS los instantes que el hindcast va a
    necesitar (grid de medidas + todos los t_now+h) en una sola pasada de pvlib.
    Devuelve una funcion clear_sky_fn(times) que sirve desde cache (instantanea) y
    solo recurre a pvlib para instantes sueltos no previstos (p.ej. el grafico de
    ejemplo). Esto hace el loop puro-pandas sin sacrificar exactitud."""
    objetivos = pd.DatetimeIndex(
        sorted({tn + pd.Timedelta(minutes=h) for tn in t_nows for h in HORIZONTES_MIN})
    )
    cs_medidas = physics.clear_sky_ghi(serie.index, **data.SITE)      # 1 llamada
    cs_objetivos = physics.clear_sky_ghi(objetivos, **data.SITE)      # 1 llamada
    cache = pd.concat([cs_medidas, cs_objetivos])
    cache = cache[~cache.index.duplicated(keep="first")].sort_index()

    def clear_sky_fn(times):
        idx = pd.DatetimeIndex(times)
        out = cache.reindex(idx)
        faltan = out.isna().to_numpy()
        if faltan.any():                                              # respaldo pvlib
            out.iloc[faltan] = physics.clear_sky_ghi(idx[faltan], **data.SITE).to_numpy()
        return out

    return clear_sky_fn


def real_en(serie: pd.Series, t) -> float:
    """GHI medido mas cercano a t dentro de TOL_REAL; NaN si cae en un hueco."""
    idx = serie.index
    pos = idx.searchsorted(t)
    mejor, dmin = None, None
    for p in (pos - 1, pos):
        if 0 <= p < len(idx):
            d = abs(idx[p] - t)
            if dmin is None or d < dmin:
                dmin, mejor = d, p
    if mejor is None or dmin > TOL_REAL:
        return float("nan")
    return float(serie.iloc[mejor])


def generar_t_nows(serie: pd.Series) -> pd.DatetimeIndex:
    """Instantes de decision: cada dia de la ventana, a las horas HORAS_DIA en punto
    (hora local). No se 'snapean' a una lectura: representan el reloj de pared al que
    se emitiria el pronostico usando todo lo disponible hasta justo antes."""
    dias = pd.date_range(serie.index.min().normalize(), serie.index.max().normalize(),
                         freq="D", tz=data.TZ)
    t_nows = [d + pd.Timedelta(hours=h) for d in dias for h in HORAS_DIA]
    t_nows = pd.DatetimeIndex(t_nows)
    return t_nows[(t_nows >= serie.index.min()) & (t_nows <= serie.index.max())]


# ---------------------------------------------------------------------------
def correr_hindcast(serie, t_nows, clear_sky_fn):
    """Recorre el reloj simulado y acumula (smart, naive, real) por horizonte."""
    res = {h: {"smart": [], "naive": [], "real": []} for h in HORIZONTES_MIN}
    for now in t_nows:
        # kt* del lookback es igual para todos los horizontes -> smart lo recalcula
        # barato (clear-sky del lookback sale de cache). El naive no depende de h.
        npv = naive_persistence(now, 0, lookback_min=LOOKBACK_MIN)
        for h in HORIZONTES_MIN:
            t_target = now + pd.Timedelta(minutes=h)
            cs_t = float(clear_sky_fn(pd.DatetimeIndex([t_target])).iloc[0])
            if cs_t <= UMBRAL_CS:                       # target de noche -> no se evalua
                continue
            real = real_en(serie, t_target)
            if np.isnan(real):                          # hueco de datos -> saltar
                continue
            sp = smart_persistence(now, h * 60, lookback_min=LOOKBACK_MIN,
                                   clear_sky_fn=clear_sky_fn)
            if np.isnan(sp) or np.isnan(npv):
                continue
            res[h]["smart"].append(sp)
            res[h]["naive"].append(npv)
            res[h]["real"].append(real)
    return res


def metricas(res) -> pd.DataFrame:
    """MAE/RMSE de smart y naive + SKILL, por horizonte."""
    filas = []
    for h in HORIZONTES_MIN:
        s = np.array(res[h]["smart"]); n = np.array(res[h]["naive"]); r = np.array(res[h]["real"])
        if len(r) == 0:
            continue
        mae_s = float(np.mean(np.abs(s - r)));  rmse_s = float(np.sqrt(np.mean((s - r) ** 2)))
        mae_n = float(np.mean(np.abs(n - r)));  rmse_n = float(np.sqrt(np.mean((n - r) ** 2)))
        skill = 1 - mae_s / mae_n if mae_n > 0 else float("nan")
        filas.append(dict(horizonte=ETIQUETA_H[h], N=len(r),
                          MAE_smart=mae_s, RMSE_smart=rmse_s,
                          MAE_naive=mae_n, RMSE_naive=rmse_n, SKILL=skill))
    return pd.DataFrame(filas)


# ---------------------------------------------------------------------------
def elegir_dia_ejemplo(serie, clear_sky_fn):
    """Dia despejado y bien cubierto para ilustrar (kt* alto de 7h a ~16h)."""
    cs = clear_sky_fn(serie.index)
    kt = physics.clear_sky_index(serie, cs, UMBRAL_CS)
    df = pd.DataFrame({"kt": kt.values, "h": kt.index.hour}, index=kt.index)
    mejor, mejor_med = None, -1.0
    for dia, g in df.groupby(df.index.date):
        horas = set(g["h"])
        if len(g) >= 80 and horas >= {7, 9, 11, 13, 15}:   # cobertura de dia completa
            med = float(g["kt"].median())
            if med > mejor_med:
                mejor_med, mejor = med, dia
    return mejor, mejor_med


def fig_dia_ejemplo(serie, clear_sky_fn, dia, kt_med):
    """04: pronostico a 1h (smart vs naive vs real) a lo largo de un dia."""
    h_min = 60
    real_dia = serie[serie.index.date == dia]
    ini = pd.Timestamp(f"{dia} 07:00", tz=data.TZ)
    fin = pd.Timestamp(f"{dia} 16:00", tz=data.TZ)
    taus = pd.date_range(ini, fin, freq="15min", tz=data.TZ)   # tiempo de validez
    ts, sp_v, np_v = [], [], []
    for tau in taus:
        now = tau - pd.Timedelta(minutes=h_min)                # se pronostico 1h antes
        sp = smart_persistence(now, h_min * 60, lookback_min=LOOKBACK_MIN,
                               clear_sky_fn=clear_sky_fn)
        npv = naive_persistence(now, h_min * 60, lookback_min=LOOKBACK_MIN)
        ts.append(tau); sp_v.append(sp); np_v.append(npv)

    fig, ax = plt.subplots(figsize=(11, 4.5))
    ax.plot(real_dia.index, real_dia.values, color="k", lw=1.6, label="GHI real medido")
    ax.plot(ts, sp_v, color="tab:green", lw=1.8, marker="o", ms=3,
            label="Pronostico smart (1h antes)")
    ax.plot(ts, np_v, color="tab:red", lw=1.6, ls="--", marker="s", ms=3,
            label="Pronostico naive (1h antes)")
    ax.set_ylabel("GHI [W/m2]"); ax.set_xlabel("hora local")
    ax.set_title(f"Hindcast a 1h - {dia} (dia despejado, kt* mediano={kt_med:.2f})\n"
                 "naive va corrido ~1h (ignora el sol); smart sigue al real")
    ax.legend(loc="upper right"); ax.grid(alpha=.3)
    fig.autofmt_xdate(); fig.tight_layout()
    fig.savefig(IMG / "04_hindcast_ejemplo.png", dpi=110); plt.close(fig)


def fig_skill(df):
    """05: MAE (smart vs naive) y SKILL vs horizonte."""
    x = [int(k) for k in [30, 60, 120, 180] if ETIQUETA_H[k] in set(df["horizonte"])]
    etq = [ETIQUETA_H[k] for k in x]
    d = df.set_index("horizonte")
    mae_s = [d.loc[ETIQUETA_H[k], "MAE_smart"] for k in x]
    mae_n = [d.loc[ETIQUETA_H[k], "MAE_naive"] for k in x]
    skill = [d.loc[ETIQUETA_H[k], "SKILL"] for k in x]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))
    ax1.plot(x, mae_s, marker="o", color="tab:green", label="smart")
    ax1.plot(x, mae_n, marker="s", color="tab:red", ls="--", label="naive")
    ax1.set_xticks(x); ax1.set_xticklabels(etq)
    ax1.set_xlabel("horizonte"); ax1.set_ylabel("MAE [W/m2]")
    ax1.set_title("Error absoluto medio vs horizonte"); ax1.legend(); ax1.grid(alpha=.3)

    ax2.plot(x, skill, marker="o", color="tab:blue")
    ax2.axhline(0, color="k", lw=1, ls=":")
    ax2.set_xticks(x); ax2.set_xticklabels(etq)
    ax2.set_xlabel("horizonte"); ax2.set_ylabel("SKILL = 1 - MAE_smart/MAE_naive")
    ax2.set_title("Ventaja de smart sobre naive (>0 = smart gana)"); ax2.grid(alpha=.3)
    for xi, si in zip(x, skill):
        ax2.annotate(f"{si:+.2f}", (xi, si), textcoords="offset points", xytext=(0, 8),
                     ha="center", fontsize=9)
    fig.tight_layout()
    fig.savefig(IMG / "05_skill_vs_horizonte.png", dpi=110); plt.close(fig)


# ---------------------------------------------------------------------------
def main():
    serie = data.cargar_serie()
    print(f"Serie: {len(serie)} lecturas | {serie.index.min()} -> {serie.index.max()}")

    t_nows = generar_t_nows(serie)
    print(f"Instantes de decision (t_now, {min(HORAS_DIA)}h..{max(HORAS_DIA)}h): {len(t_nows)}")

    clear_sky_fn = construir_cache_clearsky(serie, t_nows)
    res = correr_hindcast(serie, t_nows, clear_sky_fn)
    df = metricas(res)

    print("\n===== METRICAS POR HORIZONTE (W/m2) =====")
    print(f"lookback smart={LOOKBACK_MIN}min | N = casos de dia validos por horizonte\n")
    cols = ["horizonte", "N", "MAE_smart", "RMSE_smart", "MAE_naive", "RMSE_naive", "SKILL"]
    print(df[cols].to_string(index=False,
          formatters={"MAE_smart": "{:.1f}".format, "RMSE_smart": "{:.1f}".format,
                      "MAE_naive": "{:.1f}".format, "RMSE_naive": "{:.1f}".format,
                      "SKILL": "{:+.3f}".format}))

    dia, kt_med = elegir_dia_ejemplo(serie, clear_sky_fn)
    if dia is not None:
        fig_dia_ejemplo(serie, clear_sky_fn, dia, kt_med)
        print(f"\nDia de ejemplo (mas despejado y cubierto): {dia}  kt* mediano={kt_med:.2f}")
    fig_skill(df)
    print(f"\nImagenes en {IMG}/ : 04_hindcast_ejemplo.png, 05_skill_vs_horizonte.png")


if __name__ == "__main__":
    main()

"""
Detección de anomalías (Comparador MVP) — DETERMINISTA, sin LLM.

Dado (variable, ventana), analiza la data reciente del store `lecturas_ambientales_sc`
y devuelve HALLAZGOS estructurados. El LLM SOLO los narra; los números salen de acá.

Detecta:
  - `sin_datos_recientes`  → la última lectura es vieja (outage; el caso SC actual).
  - `sensor_plano`         → serie con varianza ~0 estando fresca (stuck, tipo 85 °C).
  - `fuera_de_rango`       → valor crudo fuera del rango físico plausible.
  - `outlier`              → z-score ROBUSTO (mediana/MAD) sobre la señal.
  - `drift`                → cambio de nivel (mediana 1ª mitad vs 2ª mitad).

Señal analizada:
  - 'irradiancia'   → kt* (índice de cielo despejado): quita la parábola solar, así
                      un kt* atípico = nube rara o falla, no "es de día".
  - 'humedad_suelo' → valor crudo (no hay análogo de cielo despejado para suelo).

Sin fuga no aplica (es análisis del pasado, no pronóstico): se mira toda la ventana.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

from pronostico import config, data
from pronostico.domain import Variable
from pronostico.physics import clear_sky_ghi, clear_sky_index

CR = ZoneInfo("America/Costa_Rica")

# Rango físico plausible del valor CRUDO por variable (fuera de esto = error de sensor).
_RANGO = {
    Variable.IRRADIANCIA.value: (-50.0, 1500.0),      # W/m2 crudos
    Variable.HUMEDAD_SUELO.value: (0.0, 65535.0),     # ADC 16-bit
}
_Z_OUTLIER = 3.5                 # umbral de z-score robusto para marcar outlier
_FRESCURA_MAX_SEG = 3600         # >1 h sin datos nuevos = "sin datos recientes"
_MAX_ANOM = 50                   # cota de hallazgos devueltos


def _z_robusto(x: pd.Series) -> pd.Series:
    """z-score robusto: 0.6745*(x-mediana)/MAD. Robusto a los propios outliers."""
    med = float(x.median())
    mad = float((x - med).abs().median())
    if mad == 0:
        return pd.Series(0.0, index=x.index)
    return 0.6745 * (x - med) / mad


def detectar(variable: str, ventana_min: float = 1440, now=None) -> dict:
    """Analiza la ventana reciente de `variable` y devuelve los hallazgos."""
    if variable not in _RANGO:
        raise ValueError(
            f"variable no soportada: {variable!r} ({'|'.join(_RANGO)})")

    serie = data.cargar_serie(variable)
    if serie.empty:
        return {"variable": variable, "estado": "sin_datos", "anomalias": [],
                "resumen": f"{variable}: el store no tiene datos."}

    ult_ts = serie.index.max()
    if ult_ts.tz is None:
        ult_ts = ult_ts.tz_localize(CR)
    # `now` = reloj de referencia para medir la frescura (default = ahora real).
    ahora = pd.Timestamp(datetime.now(CR)) if now is None else pd.Timestamp(now)
    if ahora.tz is None:
        ahora = ahora.tz_localize(CR)
    frescura_seg = int((ahora - ult_ts).total_seconds())

    desde = ult_ts - pd.Timedelta(minutes=ventana_min)
    win = serie[(serie.index >= desde) & (serie.index <= ult_ts)].astype(float)
    n = int(len(win))

    lo, hi = _RANGO[variable]
    anomalias: list[dict] = []

    # 1) fuera de rango físico (sobre el crudo)
    for ts, v in win[(win < lo) | (win > hi)].items():
        anomalias.append({"ts": ts.isoformat(), "valor": float(v),
                          "tipo": "fuera_de_rango",
                          "detalle": f"fuera de [{lo}, {hi}]"})

    # 2) señal para outliers/drift: kt* (irradiancia) o crudo (humedad)
    if variable == Variable.IRRADIANCIA.value:
        cs = clear_sky_ghi(win.index, **data.SITE)
        senal = clear_sky_index(win, cs, config.UMBRAL_CS)     # solo diurno
        nombre_senal = "kt*"
    else:
        senal = win
        nombre_senal = "crudo"

    # 3) serie plana (stuck): varianza ~0 con muestras suficientes
    plano = bool(n >= 5 and float(win.std(ddof=0)) == 0.0)

    # 4) outliers por z robusto sobre la señal
    if len(senal) >= 8:
        z = _z_robusto(senal)
        for ts, zz in z[z.abs() > _Z_OUTLIER].items():
            crudo = float(win.get(ts)) if ts in win.index else None
            anomalias.append({"ts": ts.isoformat(), "valor": crudo,
                              "tipo": "outlier", "score": round(float(zz), 2),
                              "detalle": f"z-robusto={zz:.1f} sobre {nombre_senal}"})

    # 5) drift: cambio de nivel (mediana 1ª mitad vs 2ª mitad de la señal)
    if len(senal) >= 12:
        mitad = len(senal) // 2
        m1 = float(senal.iloc[:mitad].median())
        m2 = float(senal.iloc[mitad:].median())
        mad_all = float((senal - senal.median()).abs().median())
        if mad_all > 0 and abs(m2 - m1) > 3 * 1.4826 * mad_all:
            anomalias.append({"tipo": "drift", "antes": round(m1, 3),
                              "despues": round(m2, 3),
                              "detalle": f"cambio de nivel en {nombre_senal}"})

    # estado global (prioridad: frescura > plano > insuficiente > anomalías)
    if frescura_seg > _FRESCURA_MAX_SEG:
        estado = "sin_datos_recientes"
    elif plano:
        estado = "sensor_plano"
    elif n < 5:
        estado = "datos_insuficientes"
    elif anomalias:
        estado = "anomalias_detectadas"
    else:
        estado = "normal"

    return {
        "variable": variable,
        "senal": nombre_senal,
        "ventana_min": ventana_min,
        "ultima_lectura": ult_ts.isoformat(),
        "frescura_seg": frescura_seg,
        "n_muestras": n,
        "serie_plana": plano,
        "estado": estado,
        "estadisticas": {
            "mediana": round(float(win.median()), 2),
            "min": round(float(win.min()), 2),
            "max": round(float(win.max()), 2),
            "desv": round(float(win.std(ddof=0)), 2),
        } if n else {},
        "anomalias": anomalias[:_MAX_ANOM],
        "resumen": _resumen(estado, variable, frescura_seg, len(anomalias)),
    }


def _resumen(estado: str, variable: str, frescura_seg: int, n_anom: int) -> str:
    dias = frescura_seg / 86400
    return {
        "sin_datos_recientes": f"{variable}: SIN datos nuevos hace {dias:.1f} días "
                               f"(posible outage del sensor).",
        "sensor_plano": f"{variable}: serie PLANA (valor pegado) — sensor sospechoso.",
        "datos_insuficientes": f"{variable}: datos insuficientes en la ventana.",
        "anomalias_detectadas": f"{variable}: {n_anom} anomalía(s) detectada(s).",
        "normal": f"{variable}: sin anomalías; comportamiento normal.",
    }.get(estado, f"{variable}: {estado}.")

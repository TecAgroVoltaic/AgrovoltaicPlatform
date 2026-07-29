"""
La herramienta de pronostico: UNICO puente entre el LLM y los numeros.

El LLM nunca calcula: cuando quiere pronosticar, llama a esta herramienta. Aqui
se DESPACHA por variable ('irradiancia' | 'humedad_suelo') al forecaster que
corresponde y se arma un dict JSON-serializable con valor esperado, banda de
incertidumbre y contexto para redactar.

  FORECAST_TOOL_SCHEMA : esquema de tool de Anthropic (lo que ve el modelo).
  run_forecast(...)    : la ejecucion real (lo que corre el lazo del agente).
"""
from __future__ import annotations

import math

import pandas as pd

from pronostico import config, data
from pronostico.domain import UNIDAD, Variable
from pronostico.physics import clear_sky_ghi, clear_sky_index
from pronostico.forecasters.persistence import smart_persistence, MIN_MUESTRAS
from pronostico.forecasters.humidity import humidity_persistence
from pronostico.nlu.horizon import parse_horizon

# Ventana (min) para estimar el estado reciente que persiste el modelo.
_LOOKBACK_MIN = 60
# Limites duros del horizonte (segundos): 1 min .. 6 horas.
_MIN_SEG, _MAX_SEG = 60, 21600

# Esquema que ve el modelo. La descripcion INSISTE en que llame a la herramienta
# y traduzca el horizonte a segundos; nunca invente numeros.
FORECAST_TOOL_SCHEMA = {
    "name": "forecast",
    "description": (
        "Pronostica una VARIABLE ambiental a un horizonte dado. Variables: "
        "'irradiancia' (radiacion solar GHI, W/m2) y 'humedad_suelo' (humedad de "
        "suelo, lectura CRUDA sin calibrar). Llama SIEMPRE a esta herramienta para "
        "pronosticar; nunca inventes numeros. Devuelve el valor esperado, una banda "
        "de incertidumbre (bajo-alto) y contexto. Pasa tambien la frase original del "
        "horizonte en 'horizonte_texto' para validar la conversion."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": {
                "type": "string",
                "enum": [Variable.IRRADIANCIA.value, Variable.HUMEDAD_SUELO.value],
                "description": (
                    "Que pronosticar: 'irradiancia' (W/m2) o 'humedad_suelo' "
                    "(lectura cruda del sensor de suelo)."
                ),
            },
            "horizon_seconds": {
                "type": "integer",
                "minimum": 60,
                "maximum": 21600,
                "description": (
                    "Horizonte del pronostico en SEGUNDOS. Traduci el horizonte de "
                    "la pregunta: media hora=1800, una hora=3600, hora y media=5400, "
                    "2 horas=7200, 3 horas=10800. Maximo 6 horas (21600)."
                ),
            },
            "horizonte_texto": {
                "type": "string",
                "description": (
                    "La frase ORIGINAL del horizonte tal como la dijo el usuario "
                    "(p. ej. 'dos horas', 'media hora', 'hora y media'). Se usa para "
                    "validar la conversion a segundos de forma determinista."
                ),
            },
        },
        "required": ["variable", "horizon_seconds"],
        "additionalProperties": False,
    },
}


def _resolver_horizonte(horizon_seconds, horizonte_texto) -> int:
    """Horizonte en segundos, VALIDADO de forma determinista.

    Si el LLM manda la frase original, `parse_horizon` (sin LLM, testeable) es la
    fuente de verdad: su aritmetica no depende del modelo. Si la frase no se
    reconoce, se usa el `horizon_seconds` del LLM. En ambos casos se acota a
    [60, 21600] s.
    """
    seg = int(horizon_seconds) if horizon_seconds else None
    if horizonte_texto:
        try:
            seg = parse_horizon(horizonte_texto)   # el deterministico manda
        except ValueError:
            pass                                   # frase no interpretable -> queda el del LLM
    if seg is None or seg <= 0:
        raise ValueError(
            f"horizonte invalido: horizon_seconds={horizon_seconds!r}, "
            f"horizonte_texto={horizonte_texto!r}"
        )
    return max(_MIN_SEG, min(_MAX_SEG, seg))


def _forecast_irradiancia(seg: int, now=None) -> dict:
    """Pronostico de irradiancia (GHI): persistencia inteligente de kt* + geometria
    solar del futuro. De noche el valor es 0; de dia sin datos recientes, None."""
    serie = data.cargar_serie()
    now = serie.index.max() if now is None else pd.Timestamp(now)
    if now.tz is None:
        now = now.tz_localize(config.TZ)
    t_target = now + pd.Timedelta(seconds=seg)

    # Cielo despejado en el instante objetivo (astronomico, no es fuga).
    cs_target = float(clear_sky_ghi(pd.DatetimeIndex([t_target]), **data.SITE).iloc[0])
    es_noche = cs_target <= config.UMBRAL_CS

    # kt* reciente (MEDIANA) + nº de lecturas utiles, para el contexto.
    recientes = data.get_recent_data(now, _LOOKBACK_MIN)
    kt_bar = float("nan")
    n_muestras = 0
    if not recientes.empty:
        cs_rec = clear_sky_ghi(recientes.index, **data.SITE)
        kt = clear_sky_index(recientes, cs_rec, config.UMBRAL_CS)
        n_muestras = int(len(kt))
        if n_muestras >= MIN_MUESTRAS:
            kt_bar = float(kt.median())

    # El pronostico fisico (valor + banda). El LLM jamas toca este numero.
    pred, lo, hi = smart_persistence(now, seg, lookback_min=_LOOKBACK_MIN,
                                     retornar_banda=True)

    advertencia = None
    if es_noche:
        valor, banda_lo, banda_hi = 0.0, 0.0, 0.0
    elif not math.isfinite(pred):
        valor = banda_lo = banda_hi = None
        advertencia = (f"datos recientes insuficientes ({n_muestras} lecturas utiles "
                       f"en la ultima hora) para un pronostico confiable")
    else:
        valor = round(pred, 1)
        banda_lo = round(max(0.0, lo), 1)
        banda_hi = round(hi, 1)

    return {
        "variable": Variable.IRRADIANCIA.value,
        "unidad": UNIDAD[Variable.IRRADIANCIA.value],
        "ahora": now.isoformat(),
        "horizonte_segundos": int(seg),
        "momento_pronosticado": t_target.isoformat(),
        "valor_esperado": valor,
        "banda": {"bajo": banda_lo, "alto": banda_hi, "nivel": "±1σ"},
        "contexto": {
            "kt_estrella_reciente": round(kt_bar, 3) if math.isfinite(kt_bar) else None,
            "muestras_recientes": n_muestras,
            "cielo_despejado_en_el_momento": round(cs_target, 1),
            "es_de_noche": bool(es_noche),
            "advertencia": advertencia,
            "nota": "sitio muy nuboso; variabilidad intra-hora alta",
        },
    }


def _forecast_humedad(seg: int, now=None) -> dict:
    """Pronostico de humedad de suelo (crudo): el suelo cambia lento -> persistir
    la mediana reciente; banda por variabilidad reciente. Sin cielo-despejado."""
    serie = data.cargar_serie(Variable.HUMEDAD_SUELO.value)
    now = serie.index.max() if now is None else pd.Timestamp(now)
    if now.tz is None:
        now = now.tz_localize(config.TZ)
    t_target = now + pd.Timedelta(seconds=seg)

    recientes = data.get_recent_data(now, _LOOKBACK_MIN, Variable.HUMEDAD_SUELO.value)
    n_muestras = int(len(recientes))
    pred, lo, hi = humidity_persistence(now, seg, lookback_min=_LOOKBACK_MIN,
                                        retornar_banda=True)

    advertencia = None
    if not math.isfinite(pred):
        valor = banda_lo = banda_hi = None
        advertencia = (f"datos recientes insuficientes ({n_muestras} lecturas "
                       f"en la ultima hora) para un pronostico confiable")
    else:
        valor = round(pred, 1)
        banda_lo = round(lo, 1)
        banda_hi = round(hi, 1)

    return {
        "variable": Variable.HUMEDAD_SUELO.value,
        "unidad": UNIDAD[Variable.HUMEDAD_SUELO.value],
        "ahora": now.isoformat(),
        "horizonte_segundos": int(seg),
        "momento_pronosticado": t_target.isoformat(),
        "valor_esperado": valor,
        "banda": {"bajo": banda_lo, "alto": banda_hi, "nivel": "±1σ"},
        "contexto": {
            "muestras_recientes": n_muestras,
            "advertencia": advertencia,
            "nota": ("humedad de suelo CRUDA (ADC sin calibrar); cambia lento, "
                     "por eso se persiste la mediana reciente"),
        },
    }


# Despacho por variable -> forecaster.
_FORECASTERS = {
    Variable.IRRADIANCIA.value: _forecast_irradiancia,
    Variable.HUMEDAD_SUELO.value: _forecast_humedad,
}


def run_forecast(variable: str, horizon_seconds: int,
                 horizonte_texto: str | None = None, now=None) -> dict:
    """Despacha por variable al forecaster que corresponde y devuelve su dict.

    variable        : 'irradiancia' o 'humedad_suelo'.
    horizon_seconds : horizonte en segundos (traducido por el LLM).
    horizonte_texto : frase original del horizonte; si viene, valida de forma
                      determinista la conversion (parse_horizon manda).
    now             : instante de referencia. Por defecto = ULTIMO timestamp de la
                      serie cacheada, NO el reloj de pared.
    """
    fc = _FORECASTERS.get(variable)
    if fc is None:
        raise ValueError(
            f"variable no soportada: {variable!r} "
            f"({'|'.join(_FORECASTERS)})"
        )
    seg = _resolver_horizonte(horizon_seconds, horizonte_texto)
    return fc(seg, now)

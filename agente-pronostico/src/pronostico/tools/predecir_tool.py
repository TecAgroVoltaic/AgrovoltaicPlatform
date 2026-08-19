"""Tool `predecir` — el agente se compromete con un numero, a ciegas.

Es la herramienta con la que el agente EJERCE su criterio: elige la configuracion
del metodo a partir del diagnostico y la aplica. Se diferencia de `forecast` en
dos cosas: ancla en el instante que se le pida (no en el ultimo dato) y acepta las
perillas.

Lo que NO devuelve es tan importante como lo que devuelve: ni el valor medido en
el instante objetivo, ni el error, ni nada derivado. Si los devolviera, el agente
podria "predecir" con la respuesta a la vista y su justificacion seria una
racionalizacion. La revelacion del resultado es un paso posterior y ajeno a esta
herramienta.

`hipotesis` es OBLIGATORIA. No es decorativa: si fuera opcional, el modelo pediria
el numero primero y despues inventaria el motivo. Al exigirla en el contrato, el
argumento tiene que existir ANTES de ver nada.
"""
from __future__ import annotations

import math

import pandas as pd

from pronostico import config, data
from pronostico.domain import UNIDAD, Variable
from pronostico.forecasters.humidity import humidity_persistence
from pronostico.forecasters.persistence import smart_persistence, MIN_MUESTRAS
from pronostico.physics import clear_sky_ghi, clear_sky_index

SCHEMA = {
    "name": "predecir",
    "description": (
        "Pronostica un instante HISTORICO con la configuracion que vos elijas, sin ver el "
        "resultado. Usala DESPUES de diagnosticar: primero mira las condiciones previas, forma "
        "una hipotesis fisica, y recien ahi predeci con la configuracion que esa hipotesis "
        "justifica. Devuelve el valor esperado y su banda; NO devuelve lo que midio el sensor "
        "ni el error, porque eso se conoce despues. Tenes que pasar `hipotesis`: el argumento "
        "por el que elegiste esa configuracion."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": {"type": "string",
                         "enum": [Variable.IRRADIANCIA.value, Variable.HUMEDAD_SUELO.value]},
            "instante": {"type": "string",
                         "description": "Momento a pronosticar, ISO ('2026-07-22T08:00')."},
            "horizonte_seg": {"type": "integer", "minimum": 60, "maximum": 21600,
                              "description": "Con cuanta anticipacion se predice."},
            "hipotesis": {
                "type": "string",
                "description": (
                    "Por que elegiste esta configuracion, apoyado en el diagnostico. Ej: "
                    "'el cielo viene cerrado y estable (11 % del techo, sin saltos), asi que "
                    "amplio la ventana a 120 min para no dejarme llevar por una lectura suelta'. "
                    "Si no tenes un argumento, usa la configuracion por defecto y decilo."
                ),
            },
            "lookback_min": {
                "type": "number", "minimum": 15, "maximum": 720,
                "description": ("Minutos hacia atras para estimar el estado a persistir. "
                                "Por defecto 60. Corta = reacciona rapido pero con pocas "
                                "muestras; larga = estable pero lenta ante un cambio real."),
            },
            "estadistico": {
                "type": "string", "enum": ["mediana", "media", "ultimo"],
                "description": ("Como se resume la ventana. Por defecto 'mediana' (robusta). "
                                "'ultimo' es lo mas reactivo."),
            },
            "kt_max": {
                "type": "number", "minimum": 0.5, "maximum": 3,
                "description": ("Tope al indice de cielo despejado. El realce por nubes lo "
                                "empuja arriba de 1 y persistir ese pico dispara el error. "
                                "Sin tope por defecto."),
            },
        },
        "required": ["variable", "instante", "horizonte_seg", "hipotesis"],
        "additionalProperties": False,
    },
}

_DEFECTOS = {"lookback_min": 60, "estadistico": "mediana", "kt_max": None}


def _ancla(instante: str, horizonte_seg: int) -> pd.Timestamp:
    """El corte de datos: se predice `instante` con `horizonte_seg` de antelacion."""
    t = pd.Timestamp(instante)
    t = t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)
    return t - pd.Timedelta(seconds=horizonte_seg)


def run(variable: str, instante: str, horizonte_seg: int, hipotesis: str,
        lookback_min: float = 60, estadistico: str = "mediana",
        kt_max: float | None = None) -> dict:
    ahora = _ancla(instante, horizonte_seg)
    objetivo = ahora + pd.Timedelta(seconds=horizonte_seg)
    usada = {"lookback_min": lookback_min, "estadistico": estadistico, "kt_max": kt_max}

    salida = {
        "variable": variable,
        "unidad": UNIDAD[variable],
        "instante_pronosticado": objetivo.isoformat(),
        "datos_visibles_hasta": ahora.isoformat(),
        "horizonte_seg": int(horizonte_seg),
        "hipotesis": hipotesis,
        "configuracion": usada,
        "es_la_configuracion_por_defecto": usada == _DEFECTOS,
        "nota": ("Este pronostico se hizo SIN ver el resultado. Lo que midio el "
                 "sensor no esta en esta respuesta y no lo vas a obtener pidiendo "
                 "de nuevo: se revela despues."),
    }

    if variable == Variable.HUMEDAD_SUELO.value:
        # El suelo no tiene analogo de cielo despejado: solo aplica la ventana.
        pred, lo, hi = humidity_persistence(ahora, horizonte_seg,
                                            lookback_min=lookback_min, retornar_banda=True)
        if estadistico != "mediana" or kt_max is not None:
            salida["aviso"] = ("en humedad de suelo solo aplica `lookback_min`: no hay kt* "
                               "que topar ni alternativa al resumen por mediana")
        salida["valor_esperado"] = None if not math.isfinite(pred) else round(pred, 1)
        salida["banda"] = ({"bajo": None, "alto": None} if not math.isfinite(pred)
                           else {"bajo": round(lo, 1), "alto": round(hi, 1), "nivel": "±1σ"})
        return salida

    cs_obj = float(clear_sky_ghi(pd.DatetimeIndex([objetivo]), **data.SITE).iloc[0])
    es_noche = cs_obj <= config.UMBRAL_CS
    recientes = data.get_recent_data(ahora, lookback_min)
    n_utiles = 0
    kt_usado = None
    if not recientes.empty:
        kt = clear_sky_index(recientes, clear_sky_ghi(recientes.index, **data.SITE),
                             config.UMBRAL_CS)
        n_utiles = int(len(kt))

    pred, lo, hi = smart_persistence(ahora, horizonte_seg, lookback_min=lookback_min,
                                     retornar_banda=True, estadistico=estadistico,
                                     kt_max=kt_max)
    if es_noche:
        salida["valor_esperado"] = 0.0
        salida["banda"] = {"bajo": 0.0, "alto": 0.0, "nivel": "±1σ"}
    elif not math.isfinite(pred):
        salida["valor_esperado"] = None
        salida["banda"] = {"bajo": None, "alto": None}
        salida["advertencia"] = (f"solo {n_utiles} lecturas utiles en la ventana "
                                 f"(minimo {MIN_MUESTRAS}): no alcanza para pronosticar")
    else:
        salida["valor_esperado"] = round(pred, 1)
        salida["banda"] = {"bajo": round(max(0.0, lo), 1), "alto": round(hi, 1), "nivel": "±1σ"}
        kt_usado = round(pred / cs_obj * 100, 1) if cs_obj > 0 else None

    salida["contexto"] = {
        "muestras_en_la_ventana": n_utiles,
        "pct_del_techo_persistido": kt_usado,
        "techo_en_el_objetivo": round(cs_obj, 1),
        "es_de_noche": bool(es_noche),
    }
    return salida

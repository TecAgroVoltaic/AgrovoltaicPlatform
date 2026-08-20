"""
Forecasters de irradiancia (GHI).

Dos modelos que comparten firma `(now, horizon_seconds, ...)` y devuelven el GHI
pronosticado [W/m2] para el instante now+horizon. Ambos son estrictamente SIN FUGA:
solo consumen datos medidos con timestamp < now (via get_recent_data).

  smart_persistence  -> persiste la ANOMALIA de kt* respecto de lo normal a esa
                        hora, contraida segun el horizonte, y la re-expande con la
                        geometria solar del futuro. El rival "listo".
  naive_persistence  -> persiste el ULTIMO GHI crudo. El rival tonto (ignora el sol).

Que cambio y por que (2026-08-19)
---------------------------------
Antes esto era persistencia PURA del kt* reciente. Medido sobre 78 dias, ese
metodo tenia dos defectos estructurales, no un desajuste:

  * Sesgo por hora del dia. Persistir la manana hacia la tarde ignora que aca las
    tardes se cierran: a 3 h de anticipacion el sesgo iba de -21 % (objetivo 11 h)
    a +52 % (objetivo 16 h).
  * Sobre-dispersion a horizontes largos. kt* se auto-correlaciona 0,31 a 3 h y
    0,13 a 6 h, pero la persistencia conservaba el 100 % de la anomalia.

El estimador vive ahora en `forecasters/estimador.py` (una sola implementacion,
compartida con el backtest) y lo normal de cada hora en `forecasters/climatologia.py`.
Fuera de muestra: RMSE -10,6 % a 3 h y -13,2 % a 6 h, y el sesgo de las 15-16 h
pasa de +37/+52 % a menos de 5 %.

La banda de incertidumbre vive en `uncertainty.banda_empirica`.
"""
from __future__ import annotations

import pandas as pd

from pronostico import config, data as _data
from pronostico.domain import Variable
from pronostico.physics import clear_sky_ghi, clear_sky_index, reconstruct_ghi
from pronostico.forecasters import estimador, nwp, riesgo
from pronostico.forecasters.uncertainty import banda_empirica


def _cs_default(times):
    """Cielo despejado en el sitio configurado (San Carlos)."""
    return clear_sky_ghi(times, **_data.SITE)


# Minimo de kt* diurnos utiles en el lookback para animarse a pronosticar. Con
# menos, la estimacion es demasiado fragil (1-2 lecturas ruidosas la dominarian):
# se devuelve NaN ("no se") en vez de un numero armado con casi nada.
MIN_MUESTRAS = 3

# Estadisticos aceptados para resumir la ventana reciente (delegado al estimador,
# que es quien los implementa). Se re-exporta para que quien valide una entrada no
# tenga que conocer dos modulos.
_ESTADISTICOS = set(estimador.ESTADISTICOS)


def pronostico_detallado(now, horizon_seconds, lookback_min: float = 60,
                         umbral_cs: float | None = None, get_recent=None,
                         clear_sky_fn=None,
                         estadistico: str = estimador.POR_DEFECTO,
                         kt_max: float | None = None,
                         peso: float | None = None,
                         variable: str = Variable.IRRADIANCIA.value,
                         con_banda: bool = True, centrar: bool = True,
                         clima_fn=None) -> dict:
    """El pronostico CON su explicacion. Es la funcion primaria del modulo.

    Receta:
      1. kt* de los ultimos `lookback_min` (SOLO lecturas < now).
      2. resumirlos (por defecto EWMA de 15 min de vida media).
      3. ubicar ese resumen contra lo NORMAL de esa hora y de la hora objetivo, y
         contraer la diferencia segun cuanto vale lo reciente a ese horizonte.
      4. GHI_pred = kt*_pred x GHI_cieloclaro(now+h).

    El paso 4 mete la geometria solar del FUTURO (astronomica, licita). El paso 3
    es el que corrige el sesgo diurno y la sobre-dispersion; ver el docstring del
    modulo y `physics.mezcla_convexa`.

    Sin fuga: los kt* salen de get_recent (timestamp < now) y la climatologia se
    arma con dias COMPLETOS anteriores al corte; el cielo despejado en now+h no
    usa ningun dato medido.

    Devuelve un dict con `valor` (NaN si no se puede), `bajo`, `alto`, `origen_banda`
    y el detalle del estimador. Nunca lanza por falta de datos.
    """
    if estadistico not in _ESTADISTICOS:
        raise ValueError(f"estadistico invalido: {estadistico!r} "
                         f"({', '.join(sorted(_ESTADISTICOS))})")
    get_recent = get_recent or _data.get_recent_data
    clear_sky_fn = clear_sky_fn or _cs_default
    umbral_cs = config.UMBRAL_CS if umbral_cs is None else umbral_cs

    now = pd.Timestamp(now)
    t_target = now + pd.Timedelta(seconds=horizon_seconds)
    vacio = {"valor": float("nan"), "bajo": float("nan"), "alto": float("nan"),
             "origen_banda": "sin-datos", "n": 0, "peso": None,
             "kt_persistido": None, "kt_reciente": None, "centro": None,
             "kt_modelo": None, "peso_modelo": 0.0,
             "regimen": None, "turbulencia": None,
             "kt_tipico_ahora": None, "kt_tipico_objetivo": None}

    recientes = get_recent(now, lookback_min)            # GHI medida, estrictamente < now
    if recientes.empty:
        return vacio

    cs_reciente = clear_sky_fn(recientes.index)          # cielo despejado en esos instantes
    kt = clear_sky_index(recientes, cs_reciente, umbral_cs)
    if len(kt) < MIN_MUESTRAS:           # ventana nocturna o con muy pocos kt* utiles
        return vacio

    # En que regimen viene el cielo. Alimenta la BANDA (momentos comparables) y
    # la confianza que declara el agente, nunca el valor central: anticipar la
    # nube no se puede, cuantificar el riesgo si. Ver `forecasters/riesgo`.
    estado = riesgo.regimen_actual(now, variable)

    est = estimador.kt_a_persistir(kt, t_target, horizon_seconds, variable=variable,
                                   antes_de=now, estadistico=estadistico,
                                   peso=peso, kt_max=kt_max, centrar=centrar,
                                   clima_fn=clima_fn)
    # ADDON opcional: segunda opinion de los modelos numericos. Apagado por
    # defecto; si esta prendido y el servicio no responde, `kt_pronosticado`
    # devuelve None y todo sigue igual. El pronostico NO depende de esto.
    kt_final, kt_modelo, peso_modelo = est.kt, None, 0.0
    if nwp.habilitado():
        kt_modelo = nwp.kt_pronosticado(t_target, variable, antes_de=now)
        if kt_modelo is not None:
            peso_modelo = nwp.peso_mezcla(horizon_seconds, variable, antes_de=now)
            kt_final = max(0.0, (1 - peso_modelo) * est.kt + peso_modelo * kt_modelo)

    cs_target = float(clear_sky_fn(pd.DatetimeIndex([t_target])).iloc[0])
    pred = float(reconstruct_ghi(kt_final, cs_target))
    # La banda cuesta recorrer el historico entero: solo se arma si la piden.
    lo, hi, origen = (
        banda_empirica(est.kt_sin_centrar, cs_target, horizon_seconds,
                       variable=variable, antes_de=now, kt_ventana=kt,
                       regimen=estado["regimen"])
        if con_banda else (float("nan"), float("nan"), "no-solicitada"))
    return {
        "valor": pred, "bajo": lo, "alto": hi, "origen_banda": origen,
        "n": est.n, "peso": est.peso, "kt_persistido": kt_final,
        "kt_reciente": est.reciente, "centro": est.centro,
        "kt_modelo": kt_modelo, "peso_modelo": peso_modelo,
        "regimen": estado["regimen"], "turbulencia": estado["turbulencia"],
        "kt_tipico_ahora": est.clima_reciente,
        "kt_tipico_objetivo": est.clima_objetivo,
    }


def smart_persistence(now, horizon_seconds, lookback_min: float = 60,
                      umbral_cs: float | None = None, get_recent=None,
                      clear_sky_fn=None, retornar_banda: bool = False,
                      estadistico: str = estimador.POR_DEFECTO,
                      kt_max: float | None = None, peso: float | None = None,
                      centrar: bool = True, clima_fn=None):
    """Persistencia INTELIGENTE del indice de cielo despejado kt*.

    Envoltorio delgado de `pronostico_detallado` con la firma historica: devuelve
    float (GHI [W/m2]), o (pred, lo, hi) con retornar_banda=True.

    `lookback_min`, `estadistico`, `kt_max` y `peso` son las PERILLAS del metodo.
    Existen para poder elegir la configuracion RAZONANDO sobre las condiciones
    previas (ver `diagnostico.condiciones`), nunca ajustandolas contra el
    resultado: eso ultimo no seria predecir.
    """
    r = pronostico_detallado(now, horizon_seconds, lookback_min=lookback_min,
                             umbral_cs=umbral_cs, get_recent=get_recent,
                             clear_sky_fn=clear_sky_fn, estadistico=estadistico,
                             kt_max=kt_max, peso=peso, con_banda=retornar_banda,
                             centrar=centrar, clima_fn=clima_fn)
    if retornar_banda:
        return r["valor"], r["bajo"], r["alto"]
    return r["valor"]


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

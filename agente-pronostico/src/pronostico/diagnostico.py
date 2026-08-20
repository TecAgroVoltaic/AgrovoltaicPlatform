"""
Diagnostico de las CONDICIONES previas a un instante — sin ver el resultado.

Por que existe: el agente no puede mejorar un pronostico mirando el error, porque
eso no es predecir, es ajustar contra la respuesta. Lo unico legitimo es razonar
sobre lo que se puede observar ANTES del momento a pronosticar, y elegir la
configuracion del metodo a partir de una hipotesis fisica.

Este modulo le da esa evidencia. Todo lo que devuelve cumple una de dos
condiciones:

  1. Es una medicion con timestamp ESTRICTAMENTE ANTERIOR al instante
     (misma barrera `< now` que usa el forecaster), o
  2. Es astronomico —el techo de cielo despejado—, que depende solo del tiempo y
     la posicion del sol y se conoce de antemano sin mirar ningun sensor.

Lo que NUNCA devuelve es el valor medido en el instante objetivo, ni el error, ni
nada derivado de ellos. Si algo de eso apareciera aca, el "razonamiento" del
agente seria una racionalizacion a posteriori.
"""
from __future__ import annotations

import pandas as pd

from pronostico import config, data
from pronostico.domain import Variable
from pronostico.forecasters import climatologia
from pronostico.physics import clear_sky_ghi, clear_sky_index

# Un salto de kt* de esta magnitud entre lecturas consecutivas es una nube
# entrando o saliendo, no ruido del sensor.
_SALTO_BRUSCO = 0.15
# Cortes de desviacion de kt* para etiquetar el regimen. Calibrados sobre el
# sitio (San Carlos es muy nuboso): con sigma < 0.05 la hora fue practicamente
# uniforme; por encima de 0.15 el cielo estuvo cambiando todo el tiempo.
_SIGMA_ESTABLE, _SIGMA_VARIABLE = 0.05, 0.15

# Teoria del metodo: que hace cada perilla y cuando DEBERIA ayudar. Es
# conocimiento de dominio, no la respuesta: le permite al agente formular una
# hipotesis antes de predecir, en vez de probar y quedarse con lo que salio bien.
TEORIA = {
    "supuesto_del_metodo": (
        "no se persiste el kt* tal cual (que fraccion del maximo posible dejan "
        "pasar las nubes): se persiste cuanto se APARTA de lo tipico de esa hora, "
        "y se lo transplanta a lo tipico de la hora objetivo. Despues se re-expande "
        "con la geometria solar del instante pronosticado. Dos supuestos, entonces: "
        "que la nubosidad cambia mas lento que el sol, y que el sitio tiene un "
        "ciclo diurno estable. Cuando alguno se rompe, el pronostico falla."
    ),
    "por_que_lo_tipico_de_la_hora": (
        "en San Carlos las mananas son mas claras que las tardes (conveccion "
        "tropical): el kt* medio va de 0,58 a las 11 h a 0,35 a las 16 h. "
        "Persistir la manana hacia la tarde, sin corregir por eso, sobre-estimaba "
        "un 37 % a las 15 h y un 52 % a las 16 h, y sub-estimaba un 21 % a las "
        "11 h. No era mala suerte: era un sesgo con signo predecible por la hora."
    ),
    "peso": (
        "cuanto vale todavia lo reciente DENTRO del horizonte. Se deriva de cuanto "
        "se parece el cielo a si mismo a ese lag: medido aca, 0,65 a 30 min, 0,52 "
        "a 1 h, 0,31 a 3 h y 0,13 a 6 h. O sea: a 6 h lo que se ve ahora casi no "
        "informa, y creerle entero produce un pronostico sobre-disparado (muy alto "
        "si ahora esta claro, muy bajo si ahora esta cerrado). El valor derivado es "
        "casi siempre el correcto; cambiarlo pide un argumento sobre HOY, no una "
        "corazonada."
    ),
    "lookback_min": (
        "cuantos minutos hacia atras se miran para estimar el estado del cielo. "
        "Ventana CORTA = sigue de cerca el estado actual, util cuando el cielo "
        "viene cambiando y lo ultimo es lo mas informativo; pero con pocas "
        "muestras una lectura rara pesa mucho. Ventana LARGA = estimacion mas "
        "estable, util con ruido o nubosidad intermitente; pero llega tarde a un "
        "cambio real de regimen."
    ),
    "estadistico": (
        "como se resume la ventana. Por defecto 'ewma': pondera por antiguedad, "
        "asi lo de hace 5 min pesa mas que lo de hace 50. 'mediana' ignora un valor "
        "atipico (un reflejo, un hueco) pero coloca la estimacion ~30 min en el "
        "pasado. 'media' incorpora el atipico. 'ultimo' es lo mas reactivo: "
        "razonable si el cielo viene virando en una direccion clara, peligroso si "
        "hay parpadeo."
    ),
    "kt_max": (
        "tope superior de kt*, contra el realce por nubes (luz reflejada en los "
        "bordes de un cumulo), que llego a 3,09 en este sitio. MEDIDO sobre el "
        "metodo actual: moverlo entre 1,2 y 2,0 cambia el error menos de "
        "0,5 W/m2. La ponderacion por antiguedad y la contraccion ya se comen esos "
        "picos. No armes una hipotesis alrededor de esta perilla."
    ),
    "advertencia": (
        "estas son hipotesis fisicas, no reglas garantizadas. Elegi la "
        "configuracion ARGUMENTANDO desde el diagnostico, y aceptá que puede "
        "salir mal: el resultado se conoce despues, no antes."
    ),
}


def _franja_del_dia(t: pd.Timestamp) -> str:
    h = t.hour + t.minute / 60
    if h < 5 or h >= 18.5:
        return "noche"
    if h < 8:
        return "amanecer"
    if h < 11:
        return "manana"
    if h < 14:
        return "mediodia"
    if h < 16.5:
        return "tarde"
    return "atardecer"


def _regimen(sigma: float) -> str:
    if sigma < _SIGMA_ESTABLE:
        return "estable"
    return "variable" if sigma < _SIGMA_VARIABLE else "muy_variable"


def condiciones(variable: str = Variable.IRRADIANCIA.value,
                instante: str | None = None, ventana_min: float = 120,
                horizonte_seg: int = 3600) -> dict:
    """Que se sabia justo ANTES de `instante`, y que dice la astronomia del futuro.

    instante      : momento a pronosticar (ISO). Por defecto, el ultimo dato.
    ventana_min   : cuanto pasado mirar para describir el regimen.
    horizonte_seg : con cuanta anticipacion se pronosticaria, para describir
                    cuanto se mueve el techo en ese lapso.
    """
    serie = data.cargar_serie(variable)
    if instante is None:
        ahora = serie.index.max()
    else:
        ahora = pd.Timestamp(instante)
        ahora = ahora.tz_localize(config.TZ) if ahora.tz is None else ahora.tz_convert(config.TZ)

    # El ancla del pronostico: se predice `instante` con `horizonte_seg` de
    # anticipacion, asi que el corte de datos esta ANTES de esa anticipacion.
    corte = ahora - pd.Timedelta(seconds=horizonte_seg)
    recientes = data.get_recent_data(corte, ventana_min, variable)   # estrictamente < corte

    salida: dict = {
        "variable": variable,
        "instante_a_pronosticar": ahora.isoformat(),
        "datos_visibles_hasta": corte.isoformat(),
        "horizonte_seg": int(horizonte_seg),
        "ventana_min": ventana_min,
        "franja_del_dia": _franja_del_dia(ahora),
        "n_lecturas": int(len(recientes)),
        "teoria": TEORIA,
        "nota": (
            "Todo esto se conoce ANTES del instante objetivo: las mediciones tienen "
            "timestamp anterior al corte, y el techo es astronomico. El valor medido "
            "en el instante objetivo NO esta aca y no lo vas a tener antes de "
            "predecir."
        ),
    }
    if recientes.empty:
        salida["aviso"] = "no hay lecturas en la ventana previa: no se puede diagnosticar"
        return salida

    cadencia = recientes.index.to_series().diff().dropna()
    salida["cadencia_mediana_seg"] = (None if cadencia.empty
                                      else int(cadencia.median().total_seconds()))

    if variable == Variable.IRRADIANCIA.value:
        cs_rec = clear_sky_ghi(recientes.index, **data.SITE)
        kt = clear_sky_index(recientes, cs_rec, config.UMBRAL_CS)
        if len(kt) >= 2:
            sigma = float(kt.std(ddof=0))
            mitad = len(kt) // 2
            saltos = int((kt.diff().abs() > _SALTO_BRUSCO).sum())
            salida["claridad_previa"] = {
                "pct_mediano": round(float(kt.median()) * 100, 1),
                "pct_minimo": round(float(kt.min()) * 100, 1),
                "pct_maximo": round(float(kt.max()) * 100, 1),
                "desviacion": round(sigma, 3),
                "n_kt_utiles": int(len(kt)),
                "tendencia_pct": round(
                    (float(kt.iloc[mitad:].median()) - float(kt.iloc[:mitad].median())) * 100, 1),
                "saltos_bruscos": saltos,
                "regimen": _regimen(sigma),
            }
        else:
            salida["claridad_previa"] = {
                "n_kt_utiles": int(len(kt)),
                "aviso": "muy pocos kt* utiles (ventana nocturna o con huecos)",
            }

        # Astronomia: licita de conocer a futuro, no usa ningun sensor.
        techo_corte = float(clear_sky_ghi(pd.DatetimeIndex([corte]), **data.SITE).iloc[0])
        techo_obj = float(clear_sky_ghi(pd.DatetimeIndex([ahora]), **data.SITE).iloc[0])
        salida["techo"] = {
            "en_el_corte": round(techo_corte, 1),
            "en_el_objetivo": round(techo_obj, 1),
            "cambio_pct": (None if techo_corte <= 0
                           else round((techo_obj / techo_corte - 1) * 100, 1)),
            "nota": ("el techo es astronomico. Si sube mucho en el horizonte "
                     "(tipico al amanecer), un mismo kt* se traduce en un salto "
                     "grande de W/m2 y el error absoluto se amplifica."),
        }

        # Lo TIPICO de la hora objetivo. `contexto_historico` da los dias
        # anteriores; esto da el ciclo diurno del sitio, que es contra lo que el
        # metodo mide la anomalia. Sin este numero el agente ve como viene el
        # cielo pero no contra que compararlo dentro del mismo dia.
        tip_obj = climatologia.kt_tipico(ahora, variable, corte)
        tip_corte = climatologia.kt_tipico(corte, variable, corte)
        salida["lo_tipico_de_esta_hora"] = {
            "pct_en_el_objetivo": None if tip_obj is None else round(tip_obj * 100, 1),
            "pct_en_el_corte": None if tip_corte is None else round(tip_corte * 100, 1),
            "peso_de_lo_reciente": round(
                climatologia.peso_persistencia(int(horizonte_seg), variable, corte), 2),
            "nota": ("el metodo persiste cuanto se APARTA la claridad actual de lo "
                     "tipico de su hora, y lo lleva a lo tipico de la hora objetivo, "
                     "contraido por `peso_de_lo_reciente`. Si lo tipico baja del corte "
                     "al objetivo (tarde) el pronostico baja aunque las nubes no "
                     "cambien, y al reves de manana."),
        }
    else:
        salida["valor_previo"] = {
            "mediano": round(float(recientes.median()), 1),
            "minimo": round(float(recientes.min()), 1),
            "maximo": round(float(recientes.max()), 1),
            "desviacion": round(float(recientes.std(ddof=0)), 1),
        }
    return salida


# ── Contexto de dias anteriores ─────────────────────────────────────────────
# Los minutos previos dicen como esta el cielo AHORA; los dias anteriores dicen
# que es NORMAL para esta hora y en que regimen viene el sitio. Eso permite
# hipotesis que la ventana corta no habilita: "esta hora suele dar 38 % y hoy
# vengo con 12 %, es un dia atipicamente cerrado". Sigue sin haber fuga: un dia
# anterior es, por definicion, anterior al corte.

_MAX_DIAS = 30


def contexto_historico(variable: str = Variable.IRRADIANCIA.value,
                       instante: str | None = None, dias: int = 7,
                       ventana_min: float = 60, horizonte_seg: int = 3600) -> dict:
    """Como se comporto ESTA MISMA HORA en los dias anteriores, y en que regimen
    viene el sitio.

    Nada de lo que devuelve toca el dia objetivo: todas las ventanas caen en dias
    estrictamente anteriores al corte (`instante - horizonte_seg`).
    """
    dias = max(1, min(int(dias), _MAX_DIAS))
    serie = data.cargar_serie(variable)
    if instante is None:
        ahora = serie.index.max()
    else:
        ahora = pd.Timestamp(instante)
        ahora = ahora.tz_localize(config.TZ) if ahora.tz is None else ahora.tz_convert(config.TZ)
    corte = ahora - pd.Timedelta(seconds=horizonte_seg)
    media_ventana = pd.Timedelta(minutes=ventana_min / 2)

    def claridad(tramo: pd.Series) -> float | None:
        """% mediano del techo en un tramo. None si no hay kt* utiles."""
        if tramo.empty:
            return None
        cs = clear_sky_ghi(tramo.index, **data.SITE)
        kt = clear_sky_index(tramo, cs, config.UMBRAL_CS)
        return None if kt.empty else round(float(kt.median()) * 100, 1)

    misma_hora, regimen = [], []
    for d in range(1, dias + 1):
        centro = ahora - pd.Timedelta(days=d)
        tramo = serie[(serie.index >= centro - media_ventana)
                      & (serie.index <= centro + media_ventana)
                      & (serie.index < corte)]          # cinturon: nunca pasa el corte
        pct = claridad(tramo) if variable == Variable.IRRADIANCIA.value else (
            None if tramo.empty else round(float(tramo.median()), 1))
        if pct is not None:
            misma_hora.append({"fecha": centro.date().isoformat(),
                               "pct_del_techo": pct, "n": int(len(tramo))})
        # Regimen del dia entero (solo horas con sol, por eso el kt* filtra solo).
        dia0 = centro.normalize()
        entero = serie[(serie.index >= dia0) & (serie.index < dia0 + pd.Timedelta(days=1))
                       & (serie.index < corte)]
        pct_dia = claridad(entero) if variable == Variable.IRRADIANCIA.value else (
            None if entero.empty else round(float(entero.median()), 1))
        if pct_dia is not None:
            regimen.append({"fecha": dia0.date().isoformat(), "pct_del_techo": pct_dia})

    salida: dict = {
        "variable": variable,
        "instante_a_pronosticar": ahora.isoformat(),
        "datos_visibles_hasta": corte.isoformat(),
        "dias_mirados": dias,
        "misma_hora_dias_previos": misma_hora,
        "regimen_diario": regimen,
        "nota": ("Todas las ventanas caen en dias ANTERIORES al corte. Sirve para "
                 "ubicar lo de hoy contra lo tipico de esta hora y contra el "
                 "regimen reciente; no dice nada del instante objetivo."),
    }
    if misma_hora:
        vals = [x["pct_del_techo"] for x in misma_hora]
        tipico = sorted(vals)[len(vals) // 2]
        salida["resumen_misma_hora"] = {
            "pct_tipico": tipico,
            "pct_min": min(vals),
            "pct_max": max(vals),
            "n_dias_con_dato": len(vals),
            "dispersion": round(max(vals) - min(vals), 1),
        }
    if len(regimen) >= 3:
        recientes = [x["pct_del_techo"] for x in regimen[:3]]
        previos = [x["pct_del_techo"] for x in regimen[3:]] or recientes
        salida["tendencia_del_regimen"] = {
            "ultimos_3_dias": round(sum(recientes) / len(recientes), 1),
            "dias_anteriores": round(sum(previos) / len(previos), 1),
            "nota": "si los ultimos dias vienen mas cerrados, el regimen es nuboso sostenido",
        }
    return salida

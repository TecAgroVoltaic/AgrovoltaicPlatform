"""
Riesgo de nubes: en que regimen esta el cielo y que tan probable es que CAMBIE.

Responsabilidad unica: cuantificar el riesgo. No pronostica (eso es `persistence`),
no dice que es normal a esta hora (eso es `climatologia`) y no arma la banda (eso
es `uncertainty`, que consume esto).

La distincion que justifica el modulo
--------------------------------------
"Va a haber nubes" y "cuanto puedo confiar en este numero" parecen la misma
pregunta y NO lo son. Medido sobre 78 dias:

  * ANTICIPAR el cambio es casi imposible. La turbulencia reciente predice la
    futura con correlacion 0,24 a 1 h, 0,17 a 3 h y 0,08 a 6 h. La nubosidad de
    los modelos numericos no predice el cambio en absoluto (r ~ 0). Una tool que
    dijera "probabilidad de nube" para corregir el VALOR CENTRAL estaria vendiendo
    una certeza que los datos no respaldan.
  * CUANTIFICAR el riesgo si funciona, y arregla un defecto real. La banda estaba
    mal calibrada por regimen: a 1 h cubria 83 % con el cielo calmo (demasiado
    ancha) y 64 % con el cielo movido (demasiado angosta). Condicionarla la deja
    pareja Y en promedio mas angosta.

Por eso este modulo alimenta la BANDA y la confianza declarada, nunca el numero
central. El valor central lo sigue decidiendo `estimador`.

Los tres hechos que devuelve
----------------------------
1. REGIMEN actual: cuanto se movio el cielo en la ultima hora, en tres tramos
   calibrados sobre el propio historico (no umbrales inventados).
2. PROBABILIDAD de un cambio fuerte dentro del horizonte, medida por hora del dia.
3. DIRECCION del riesgo. Es lo mas util y lo que el agente no tenia: de manana el
   riesgo es que SE ABRA (20 % vs 10 %), de tarde que SE TAPE (23 % vs 12 %). Es
   el ciclo convectivo del sitio, y el error del metodo es asimetrico segun cual
   ocurra: al taparse sobre-estima, al abrirse sub-estima.
"""
from __future__ import annotations

import pandas as pd

from predictivo import config
from predictivo.domain import Variable
from predictivo.forecasters import climatologia
from predictivo.physics import clear_sky_ghi, clear_sky_index

# Cambio de kt* que cuenta como "el cielo cambio de verdad", en puntos de
# porcentaje del techo. Con 25 pts el error del metodo se duplica largamente
# (MAE 58 -> 170 W/m2 a 1 h); por debajo de 10 pts es indistinguible de ruido.
CAMBIO_FUERTE = 0.25

# Ventana sobre la que se mide la turbulencia actual. Una hora es el compromiso:
# mas corto y una nube suelta lo domina, mas largo y llega tarde al cambio.
VENTANA_MIN = 60

# Etiquetas de los tres regimenes. Los CORTES no son constantes: son los terciles
# del propio historico (ver `_cortes`), asi que se mueven con el sitio.
REGIMENES = ("calmo", "medio", "turbulento")

# Minimo de observaciones para creerle a una probabilidad por hora.
MIN_MUESTRAS_HORA = 30

_CACHE: dict[tuple, object] = {}


def reiniciar_cache() -> None:
    """Vacia el cache de proceso. Lo usan los tests."""
    _CACHE.clear()


def _kt(variable: str, antes_de) -> pd.Series:
    """kt* del historico anterior al corte, en la rejilla regular."""
    return climatologia._marco(variable, antes_de)["kt"]


def _pasos(horizonte_seg: int) -> int:
    return max(1, round(int(horizonte_seg) / pd.Timedelta(climatologia.PASO).total_seconds()))


def _turbulencia(kt: pd.Series) -> pd.Series:
    """Cuanto se movio el cielo en la ultima hora, en cada instante.

    Causal: solo mira hacia atras. Es la misma cantidad que despues se usa para
    clasificar el momento que se esta pronosticando, asi que no puede depender de
    datos posteriores.
    """
    ventana = max(2, round(pd.Timedelta(minutes=VENTANA_MIN)
                           / pd.Timedelta(climatologia.PASO)))
    return kt.rolling(ventana, min_periods=ventana // 2).std(ddof=0)


def _cortes(variable: str, antes_de) -> tuple[float, float] | None:
    """Terciles historicos de la turbulencia. Definen los tres regimenes.

    Se derivan del sitio en vez de fijarse a mano: 'turbulento' en San Carlos no
    significa lo mismo que en un desierto, y un umbral quemado envejeceria mal.
    """
    clave = ("cortes", variable, climatologia._corte(antes_de).isoformat())
    if clave in _CACHE:
        return _CACHE[clave]
    turb = _turbulencia(_kt(variable, antes_de)).dropna()
    valor = None
    if len(turb) >= climatologia.MIN_PARES:
        valor = (float(turb.quantile(1 / 3)), float(turb.quantile(2 / 3)))
    _CACHE[clave] = valor
    return valor


def clasificar(turbulencia: float | None, variable: str = Variable.IRRADIANCIA.value,
               antes_de=None) -> str | None:
    """Regimen ('calmo' | 'medio' | 'turbulento') de un valor de turbulencia.

    None si no hay historia para calibrar los cortes: sin referencia, decir
    'turbulento' seria una etiqueta sin significado.
    """
    if turbulencia is None or pd.isna(turbulencia):
        return None
    cortes = _cortes(variable, antes_de)
    if cortes is None:
        return None
    bajo, alto = cortes
    if turbulencia <= bajo:
        return REGIMENES[0]
    return REGIMENES[1] if turbulencia <= alto else REGIMENES[2]


def clasificar_serie(turbulencia: pd.Series, variable: str = Variable.IRRADIANCIA.value,
                     antes_de=None) -> pd.Series:
    """`clasificar` aplicado a una serie entera, de una sola pasada.

    Existe aparte porque clasificar elemento a elemento con `.map` recorre los
    cortes por cada punto: sobre un historico de 20.000 lecturas eso pasa de
    milisegundos a decenas de segundos, y el backtest lo hace miles de veces.
    """
    import numpy as np

    cortes = _cortes(variable, antes_de)
    if cortes is None:
        return pd.Series(None, index=turbulencia.index, dtype=object)
    etiquetas = np.array(REGIMENES)[np.digitize(turbulencia.to_numpy(), cortes)]
    return pd.Series(etiquetas, index=turbulencia.index).where(turbulencia.notna())


def regimen_actual(corte, variable: str = Variable.IRRADIANCIA.value) -> dict:
    """Como venia el cielo en la ultima hora ANTES de `corte`.

    `corte` es el instante en que se pronostica, no el que se pronostica. La
    distincion no es cosmetica: si la ventana se midiera alrededor del momento
    OBJETIVO, estaria mirando datos posteriores al corte, que es exactamente la
    fuga que todo el sistema evita. Un solo instante en la firma, entonces, para
    que no haya forma de confundirlos.

    Lee la serie directamente (con la barrera `< corte` de `get_recent_data`) y no
    el marco de `climatologia`, que solo llega hasta el inicio del dia: la ultima
    hora, que es justo lo que hace falta, no esta ahi.
    """
    from predictivo import data as _data

    t = pd.Timestamp(corte)
    t = t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)

    recientes = _data.get_recent_data(t, VENTANA_MIN, variable)     # estrictamente < t
    if recientes.empty:
        return {"turbulencia": None, "regimen": None, "n": 0}
    cs = clear_sky_ghi(recientes.index, **_data.SITE)
    kt = clear_sky_index(recientes, cs, config.UMBRAL_CS)
    if len(kt) < 2:
        return {"turbulencia": None, "regimen": None, "n": int(len(kt))}
    turb = float(kt.std(ddof=0))
    return {"turbulencia": round(turb, 3),
            "regimen": clasificar(turb, variable, t),
            "n": int(len(kt))}


def probabilidad_cambio(instante, horizonte_seg: int,
                        variable: str = Variable.IRRADIANCIA.value,
                        antes_de=None) -> dict | None:
    """Con que frecuencia, historicamente, el cielo cambio fuerte a ESTA hora.

    Separada por DIRECCION, que es el aporte que el agente no tenia: de manana el
    riesgo dominante es que se abra; de tarde, que se tape. El error del metodo es
    asimetrico segun cual pase (al taparse sobre-estima, al abrirse sub-estima),
    asi que saber cual de los dos acecha cambia como leer el pronostico.

    Es una FRECUENCIA HISTORICA, no una prevision: dice que tan seguido pasa a
    esta hora, no si va a pasar hoy. La diferencia importa y viaja en la salida.
    """
    t = pd.Timestamp(instante)
    t = t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)
    corte = antes_de if antes_de is not None else t

    clave = ("prob", variable, climatologia._corte(corte).isoformat(),
             int(horizonte_seg), t.hour)
    if clave in _CACHE:
        return _CACHE[clave]

    kt = _kt(variable, corte)
    pasos = _pasos(horizonte_seg)
    cambio = kt.shift(-pasos) - kt
    dela_hora = cambio[(cambio.index.hour == t.hour) & cambio.notna()]

    valor = None
    if len(dela_hora) >= MIN_MUESTRAS_HORA:
        p_tapa = float((dela_hora < -CAMBIO_FUERTE).mean())
        p_abre = float((dela_hora > CAMBIO_FUERTE).mean())
        domina = ("taparse" if p_tapa > p_abre * 1.3 else
                  "abrirse" if p_abre > p_tapa * 1.3 else "ninguna")
        valor = {
            "pct_se_tapa": round(p_tapa * 100, 1),
            "pct_se_abre": round(p_abre * 100, 1),
            "pct_cambio_fuerte": round((p_tapa + p_abre) * 100, 1),
            "direccion_dominante": domina,
            "n_dias_observados": int(len(dela_hora)),
        }
    _CACHE[clave] = valor
    return valor


def evaluar(instante, horizonte_seg: int, variable: str = Variable.IRRADIANCIA.value,
            antes_de=None) -> dict:
    """El riesgo completo: regimen + probabilidad + que implica para el pronostico.

    Es lo que consumen la tool y la banda. Nunca falla: si no hay historia,
    devuelve los campos en None y lo dice, que es distinto de decir "sin riesgo".
    """
    corte = antes_de if antes_de is not None else instante
    reg = regimen_actual(corte, variable)
    prob = probabilidad_cambio(instante, horizonte_seg, variable, antes_de)
    horas = int(horizonte_seg) / 3600

    salida = {
        "instante": pd.Timestamp(instante).isoformat(),
        "horizonte_seg": int(horizonte_seg),
        "estado_actual": reg,
        "frecuencia_historica_a_esta_hora": prob,
        "nota": (
            "El regimen sale de la ultima hora de lecturas; la frecuencia sale de "
            "cuantas veces cambio el cielo A ESTA HORA en el historico. Es "
            "FRECUENCIA, no prevision: dice que tan seguido pasa, no si va a pasar "
            "hoy. Anticipar el cambio concreto no se puede (medido: la turbulencia "
            "reciente lo predice con correlacion 0,24 a 1 h y 0,08 a 6 h). Por eso "
            "esto sirve para graduar la CONFIANZA y leer la banda, no para mover el "
            "valor pronosticado."
        ),
    }

    lectura = []
    if reg["regimen"] == REGIMENES[2]:
        lectura.append("el cielo viene moviendose mucho: la banda es ancha con motivo "
                       "y el valor central merece poca confianza")
    elif reg["regimen"] == REGIMENES[0]:
        lectura.append("el cielo viene quieto: es el escenario donde el metodo mejor "
                       "se porta")
    if prob and prob["direccion_dominante"] == "taparse":
        lectura.append(f"a esta hora lo tipico es que se CIERRE ({prob['pct_se_tapa']} % "
                       f"de las veces): si pasa, este pronostico queda ALTO")
    elif prob and prob["direccion_dominante"] == "abrirse":
        lectura.append(f"a esta hora lo tipico es que se ABRA ({prob['pct_se_abre']} % "
                       f"de las veces): si pasa, este pronostico queda BAJO")
    if horas >= 3:
        lectura.append("a este horizonte el estado actual del cielo ya casi no informa; "
                       "el riesgo lo marca la hora del dia, no lo que se ve ahora")
    if lectura:
        salida["como_leerlo"] = lectura
    return salida

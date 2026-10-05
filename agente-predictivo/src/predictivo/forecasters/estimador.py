"""
Como se estima el kt* que se lleva al futuro. UNICA fuente de verdad del metodo.

Responsabilidad unica: dado lo que se vio hasta el corte, decidir con que indice
de cielo despejado se va a reconstruir el GHI del instante objetivo. No lee la
base (eso es `data`), no arma el dict de salida (eso son las tools) y no decide
que es normal (eso es `climatologia`).

Por que existe este modulo
--------------------------
Habia DOS implementaciones del mismo metodo. `persistence.smart_persistence`
tomaba la mediana de kt* de los ultimos 60 min; `backtest._kt_a_persistir`
agregaba franjas anteriores con otras perillas (`ventanas`, `damping`). O sea: el
agente razonaba con la teoria de un metodo y se lo evaluaba con otro, y nadie se
enteraba porque nada los comparaba. Peor: `damping`, la unica perilla que
corregia la sobre-dispersion a horizontes largos, existia SOLO en el camino que
no predice.

Aca viven las dos formas del mismo calculo, escalar y vectorizada, y las dos
llaman a la misma funcion de fisica. Hay una prueba que las obliga a coincidir.

El estimador, en tres pasos
---------------------------
1. RESUMIR la ventana reciente. Por defecto EWMA con vida media de 15 min, no la
   mediana de 60 min de antes. Medido: RMSE a 30 min baja de 169 a 155 W/m2 solo
   por este cambio. La razon es simple: la mediana de una hora coloca la
   estimacion a ~30 min en el pasado, asi que a horizontes cortos casi duplica el
   rezago efectivo. La EWMA por tiempo (no por posicion) tambien maneja sola los
   huecos: tras una noche de 12 h el peso de ayer es despreciable, sin ningun
   caso especial.
2. UBICARLA contra lo normal de su hora y de la hora objetivo (`climatologia`).
3. MEZCLAR con el peso que corresponde al horizonte (`physics.mezcla_convexa`).
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from predictivo.domain import Variable
from predictivo.forecasters import climatologia
from predictivo.physics import mezcla_convexa

# Vida media de la EWMA. 15 min a cadencia de 5 min pondera ~0,50 / 0,29 / 0,17
# las tres ultimas lecturas: sigue el cielo de cerca sin colgarse de una sola.
VIDA_MEDIA = pd.Timedelta("15min")

ESTADISTICOS = ("ewma", "mediana", "media", "ultimo")
POR_DEFECTO = "ewma"


@dataclass(frozen=True)
class Estimacion:
    """El kt* a persistir, con TODO lo que lo explica.

    Se devuelven las piezas y no solo el resultado porque las tools tienen que
    poder decir por que salio ese numero: cuanto se vio, contra que se comparo y
    cuanto se le creyo a lo reciente. Un pronostico sin eso no se puede auditar.
    """

    kt: float                       # el que se lleva al futuro (ya centrado)
    kt_sin_centrar: float           # antes de la correccion de centro (ancla de la banda)
    centro: float                   # cuanto se corrigio, en unidades de kt*
    reciente: float                 # resumen crudo de la ventana
    clima_reciente: float | None    # lo normal a la hora del corte
    clima_objetivo: float | None    # lo normal a la hora pronosticada
    peso: float                     # cuanto se le creyo a lo reciente, en [0, 1]
    n: int                          # kt* utiles en la ventana


def resumir(kt: pd.Series, estadistico: str = POR_DEFECTO) -> float:
    """Un solo numero que representa el estado reciente del cielo.

    'ewma' pondera por antiguedad (lo mas reciente pesa mas). 'mediana' ignora un
    valor atipico. 'media' lo incorpora. 'ultimo' es lo mas reactivo.
    """
    if estadistico not in ESTADISTICOS:
        raise ValueError(f"estadistico invalido: {estadistico!r} "
                         f"({', '.join(ESTADISTICOS)})")
    if estadistico == "ultimo":
        return float(kt.iloc[-1])
    if estadistico == "media":
        return float(kt.mean())
    if estadistico == "mediana":
        return float(kt.median())
    return float(kt.ewm(halflife=VIDA_MEDIA, times=kt.index).mean().iloc[-1])


def _peso(peso, horizonte_seg, variable, antes_de) -> float:
    """El peso explicito si vino, y si no el derivado de la serie."""
    if peso is not None:
        return float(min(1.0, max(0.0, peso)))
    return climatologia.peso_persistencia(horizonte_seg, variable, antes_de)


def kt_a_persistir(kt: pd.Series, instante_objetivo, horizonte_seg: int,
                   variable: str = Variable.IRRADIANCIA.value,
                   antes_de=None, estadistico: str = POR_DEFECTO,
                   peso: float | None = None, kt_max: float | None = None,
                   ajuste_diurno: bool = True, centrar: bool = True,
                   clima_fn=None) -> Estimacion:
    """Version ESCALAR: la que corre al pronosticar un instante.

    kt                : kt* de la ventana reciente (ya filtrados, ya < corte).
    instante_objetivo : el momento que se pronostica.
    antes_de          : hasta donde puede mirar la CLIMATOLOGIA. None = el propio
                        instante objetivo menos el horizonte, que es lo que ya
                        garantizo quien llama.

    Ojo con la diferencia entre `antes_de` y el momento en que se esta parado: la
    hora contra la que se compara lo reciente sale de la ULTIMA LECTURA de la
    ventana, no de `antes_de`. En produccion coinciden, pero al evaluar sobre el
    historico `antes_de` es el inicio del dia y usarlo como "ahora" compararia la
    claridad de las 10 de la manana contra lo tipico de la medianoche.
    clima_fn          : (instante, variable, corte) -> kt* tipico. Inyectable por
                        el mismo motivo que `get_recent` y `clear_sky_fn` en
                        `persistence`: una prueba con datos armados a mano no
                        puede quedar atada a la climatologia real del sitio.

    Si no hay climatologia (historia corta, sitio nuevo) cae a persistencia pura
    y lo declara con `clima_* = None`: el metodo se degrada al anterior en vez de
    inventar un tipico con tres datos.
    """
    if kt_max is not None:
        kt = kt.clip(upper=kt_max)
    reciente = resumir(kt, estadistico)

    objetivo = pd.Timestamp(instante_objetivo)
    momento = kt.index[-1] if len(kt) else (
        objetivo - pd.Timedelta(seconds=int(horizonte_seg)))
    corte = antes_de if antes_de is not None else (
        objetivo - pd.Timedelta(seconds=int(horizonte_seg)))
    clima_fn = clima_fn or climatologia.kt_tipico
    clima_obj = clima_fn(objetivo, variable, corte)
    clima_rec = clima_fn(momento, variable, corte)
    if not ajuste_diurno:
        clima_rec = clima_obj          # sin transplante de anomalia entre horas

    if clima_obj is None or clima_rec is None:
        return Estimacion(kt=reciente, kt_sin_centrar=reciente, centro=0.0,
                          reciente=reciente, clima_reciente=None,
                          clima_objetivo=None, peso=1.0, n=int(len(kt)))

    p = _peso(peso, horizonte_seg, variable, corte)
    crudo = float(mezcla_convexa(reciente, clima_rec, clima_obj, p))
    centro = _centro(horizonte_seg, variable, corte) if centrar else 0.0
    return Estimacion(kt=max(0.0, crudo + centro), kt_sin_centrar=max(0.0, crudo),
                      centro=centro, reciente=reciente,
                      clima_reciente=clima_rec, clima_objetivo=clima_obj,
                      peso=p, n=int(len(kt)))


def _centro(horizonte_seg, variable, antes_de) -> float:
    """Correccion de centro: el cuantil 50 del error historico a este horizonte.

    Contraer hacia un promedio, en un sitio donde lo normal es estar tapado, corre
    el pronostico hacia arriba de forma pareja. Esto lo corre de vuelta. 0 si no
    hay historia para medirlo (mejor no corregir que corregir a ciegas).
    """
    q = climatologia.cuantiles_error(horizonte_seg, variable, antes_de)
    return 0.0 if q is None else q[1]


def kt_a_persistir_serie(kt: pd.Series, horizonte_seg: int,
                         variable: str = Variable.IRRADIANCIA.value,
                         antes_de=None, estadistico: str = POR_DEFECTO,
                         peso: float | None = None, kt_max: float | None = None,
                         ajuste_diurno: bool = True, centrar: bool = True) -> pd.Series:
    """Version VECTORIZADA: el mismo calculo aplicado a una serie entera.

    La usan el backtest (para evaluar el metodo sobre el historico) y los
    cuantiles de la banda (para medir cuanto suele errar). `kt` debe venir en una
    rejilla REGULAR: el desplazamiento al instante objetivo se hace por posicion.

    Devuelve, para cada t, el kt* que el metodo llevaria a t + horizonte.

    `centrar=False` apaga la correccion de centro. Lo usa `climatologia` al MEDIR
    esa correccion: si se centrara ahi, el calculo se morderia la cola (el centro
    se estima de los residuos del estimador sin centrar).
    """
    if kt.empty:
        return kt
    if kt_max is not None:
        kt = kt.clip(upper=kt_max)

    if estadistico == "ultimo":
        reciente = kt.ffill()
    elif estadistico in ("mediana", "media"):
        ventana = max(2, round(pd.Timedelta("60min") / _cadencia(kt)))
        roll = kt.rolling(ventana, min_periods=2)
        reciente = roll.median() if estadistico == "mediana" else roll.mean()
    else:
        reciente = kt.ewm(halflife=VIDA_MEDIA, times=kt.index).mean()

    pasos = max(1, round(int(horizonte_seg) / _cadencia(kt).total_seconds()))
    perfil = climatologia.perfil_horario(variable, antes_de)
    if perfil.empty or perfil.isna().all():
        return reciente                          # sin climatologia: persistencia pura

    respaldo = climatologia.kt_global(variable, antes_de)
    if respaldo is None:
        respaldo = float(kt.dropna().mean())
    clima = pd.Series(kt.index.hour, index=kt.index).map(perfil).astype(float)
    clima = clima.fillna(respaldo)
    clima_obj = clima.shift(-pasos) if ajuste_diurno else clima

    p = _peso(peso, horizonte_seg, variable, antes_de)
    crudo = mezcla_convexa(reciente, clima, clima_obj, p)
    if not centrar:
        return crudo.clip(lower=0)
    return (crudo + _centro(horizonte_seg, variable, antes_de)).clip(lower=0)


def _cadencia(kt: pd.Series) -> pd.Timedelta:
    """Paso de la rejilla. Mediana de las diferencias, robusta a un hueco."""
    dt = kt.index.to_series().diff().dropna()
    return pd.Timedelta(climatologia.PASO) if dt.empty else dt.median()

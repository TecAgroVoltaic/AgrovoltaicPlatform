"""
Climatologia del sitio: QUE ES NORMAL aca, a esta hora, a este horizonte.

Responsabilidad unica: describir el comportamiento tipico del cielo a partir del
historico. No pronostica (eso es `persistence`), no estima el kt* a llevar al
futuro (eso es `estimador`) y no arma bandas (eso es `uncertainty`). Solo
responde tres preguntas, siempre mirando el pasado:

  kt_tipico(...)          que fraccion del techo suele pasar a ESTA hora del dia
  peso_persistencia(...)  cuanto vale todavia lo reciente DENTRO de h
  cuantiles_error(...)    cuanto se suele errar a ese horizonte

Por que hacia falta este modulo (el defecto que vino a cerrar)
--------------------------------------------------------------
El forecaster persistia el kt* reciente sin saber que en San Carlos las mananas
son claras y las tardes se cierran (conveccion tropical). Medido sobre 78 dias:
kt* medio 0,44 a las 6 h, 0,58 a las 11 h y 0,35 a las 16 h. Persistir la manana
hacia la tarde producia un sesgo de +36 % a las 15 h y +52 % a las 16 h, y de
-21 % a las 11 h. No era dispersion: era sesgo con signo predecible por la hora.

Tres decisiones de diseno
-------------------------
1. SE DERIVA, NO SE DECLARA. El peso es la autocorrelacion de kt* medida al lag
   pedido, no una tabla de constantes. Mismo criterio que `arquitectura.py`: si
   el sitio cambia, el numero se mueve solo y nadie tiene que acordarse.
2. VENTANA MOVIL de `DIAS_PERFIL` dias por hora del dia, con respaldo a la
   climatologia global. Medido contra una media expansiva de todo el historico,
   la movil gana por poco (MAE 156,1 vs 156,8 a 3 h) y sigue la estacion en vez
   de promediarla.
3. MISMA BARRERA ANTI-FUGA que el forecaster. El corte se lleva al inicio del
   dia (`normalize()`): la climatologia se arma solo con dias COMPLETOS
   anteriores, asi el propio dia que se esta pronosticando nunca entra en "lo
   tipico". Es mas estricto que `< now`, no menos.
"""
from __future__ import annotations

import pandas as pd

from pronostico import config, data as _data
from pronostico.domain import Variable
from pronostico.physics import clear_sky_ghi, clear_sky_index

# Rejilla regular sobre la que se miden perfil, autocorrelacion y residuos. La
# serie llega a ~5,4 min (cadencia nativa del sensor); 5 min la regulariza sin
# inventar datos (se toma la lectura mas cercana dentro de la tolerancia).
PASO = "5min"
TOLERANCIA = pd.Timedelta("4min")

DIAS_PERFIL = 30                 # ventana movil del perfil horario
MIN_POR_HORA = 24                # lecturas minimas en una hora para creerle al perfil
MIN_GLOBAL = 50                  # lecturas minimas para una climatologia global
MIN_PARES = 200                  # pares minimos para creerle a una autocorrelacion

# Cuando no hay historia suficiente para medir el peso, se persiste tal cual
# (peso 1). Es el comportamiento anterior: ante la duda, no cambiar nada.
PESO_SIN_HISTORIA = 1.0

# Desde donde y hasta donde se aplica la contraccion hacia lo tipico.
#
# La contraccion NO conviene siempre, y esto se midio, no se supuso. A media hora
# el cielo todavia se parece bastante a si mismo (correlacion 0,62), asi que
# desconfiar de lo que se ve tira informacion buena: el error absoluto sube ~10
# W/m2 y el sesgo apenas mejora 7. A 6 h pasa lo contrario: la correlacion es
# 0,13 y contraer gana en TODO (MAE, RMSE y sesgo a la vez, sin contrapartida).
# El cruce cae cerca de las 2 h.
#
# Por eso el peso se interpola entre los dos extremos en vez de saltar en un
# punto: con un corte duro, pedir 7199 s y 7201 s daria pronosticos distintos por
# una diferencia de un segundo, que no corresponde a nada fisico. Entre 1 h y 3 h
# la evidencia es mixta y la transicion gradual es la forma honesta de decirlo.
#
# ADVERTENCIA: estos dos limites salen de 78 dias de datos, de los cuales el
# periodo evaluado atraviesa un cambio de estacion. NO son constantes de la
# fisica: son una medicion con poca muestra. Revisar con `scripts/calibrar.py`
# cuando haya mas de una estacion de historia.
H_SIN_CONTRAER = 3600.0        # <= 1 h: se persiste tal cual (peso 1)
H_CONTRACCION_PLENA = 10800.0  # >= 3 h: contraccion completa (peso = correlacion)
# Cuantiles del error. 16-84 es el equivalente empirico de +-1 sigma; el 50 es el
# CENTRO de la distribucion, que se usa para corregir el punto (ver abajo).
Q_BAJO, Q_CENTRO, Q_ALTO = 0.16, 0.50, 0.84

# Cache por proceso: (variable, dia del corte) -> marco con kt* en la rejilla.
# Un backtest recorre miles de instantes del mismo dia; sin esto se recalcularia
# el clear-sky de la serie entera en cada uno.
_CACHE: dict[tuple[str, str], pd.DataFrame] = {}
# Cuantiles del error: recorren el historico entero con el estimador aplicado, asi
# que se cachean por (variable, dia del corte, horizonte). Sin esto CADA pronostico
# pagaria esa pasada, y un backtest la pagaria miles de veces.
_CACHE_Q: dict[tuple[str, str, int], tuple[float, float, float] | None] = {}
_CACHE_MAX = 8


def reiniciar_cache() -> None:
    """Vacia los caches de proceso. Los usan los tests para no cruzarse entre si."""
    _CACHE.clear()
    _CACHE_Q.clear()


def _corte(antes_de) -> pd.Timestamp:
    """Instante hasta el que se puede mirar, llevado al inicio de su dia.

    Redondear hacia atras es lo que garantiza que el dia en curso no se cuele en
    "lo tipico". Nunca amplia la ventana visible, solo la recorta.
    """
    t = pd.Timestamp(antes_de)
    t = t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)
    return t.normalize()


def _marco(variable: str, antes_de) -> pd.DataFrame:
    """kt* del historico ANTERIOR al corte, sobre la rejilla regular.

    Columnas: `kt` (NaN de noche y donde no hubo lectura) y `hora` (hora local
    entera, la clave del perfil).
    """
    corte = _corte(antes_de)
    clave = (variable, corte.isoformat())
    en_cache = _CACHE.get(clave)
    if en_cache is not None:
        return en_cache

    serie = _data.cargar_serie(variable)
    serie = serie[serie.index < corte]
    if serie.empty:
        # Indice VACIO pero tz-aware: quien reciba este marco va a comparar su
        # indice contra una fecha, y un RangeIndex vacio hace estallar esa
        # comparacion en vez de devolver "no hay nada". El caso aparece con
        # historia corta, que es justo cuando menos se quiere una excepcion.
        vacio_idx = pd.DatetimeIndex([], tz=config.TZ, name="ts")
        vacio = pd.Series(dtype=float, index=vacio_idx)
        marco = pd.DataFrame({"g": vacio, "cs": vacio, "kt": vacio,
                              "hora": pd.Series(dtype=int, index=vacio_idx)})
    else:
        rejilla = pd.date_range(serie.index.min().ceil(PASO), serie.index.max().floor(PASO),
                                freq=PASO, tz=serie.index.tz)
        medida = serie.reindex(rejilla, method="nearest", tolerance=TOLERANCIA)
        if variable == Variable.IRRADIANCIA.value:
            cs = clear_sky_ghi(rejilla, **_data.SITE)
            # `clear_sky_index` descarta las filas nocturnas; aca hace falta
            # conservar la rejilla completa (los huecos son parte de la senal),
            # asi que se reindexa de vuelta con NaN donde no hay kt*.
            kt = clear_sky_index(medida, cs, config.UMBRAL_CS).reindex(rejilla)
            cs = cs.where(cs > config.UMBRAL_CS)      # de noche el techo no cuenta
        else:
            # El suelo no tiene techo: techo 1 deja el valor crudo tal cual y el
            # resto del modulo funciona sin ramas especiales.
            cs = pd.Series(1.0, index=rejilla)
            kt = medida
        marco = pd.DataFrame({"g": medida, "cs": cs, "kt": kt, "hora": rejilla.hour},
                             index=rejilla)

    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[clave] = marco
    return marco


def perfil_horario(variable: str = Variable.IRRADIANCIA.value,
                   antes_de=None) -> pd.Series:
    """kt* medio por hora local en los ultimos `DIAS_PERFIL` dias antes del corte.

    Indexada por hora entera (0..23). Las horas sin muestras suficientes quedan
    NaN: es preferible caer al valor global a inventar un tipico con tres datos.

    Se define como SUMA(medida) / SUMA(techo) de la hora, no como el promedio de
    los kt* sueltos. Es la definicion estandar del indice de cielo despejado sobre
    un periodo, y es la unica que hace comparables este perfil y el kt* que el
    backtest calcula por franja (media de la medida / media del techo). Con dos
    definiciones distintas, la anomalia que se persiste tendria un sesgo que nadie
    veria: se cancelan al restar solo si ambas se miden igual.

    Suma y no mediana a proposito: la combinacion convexa es optima en error
    cuadratico, y ahi el ancla correcta es la media condicional.
    """
    marco = _marco(variable, antes_de if antes_de is not None else _fin_de_serie(variable))
    if marco.empty:
        return pd.Series(dtype=float)
    desde = marco.index.max() - pd.Timedelta(days=DIAS_PERFIL)
    reciente = marco[marco.index >= desde]
    if reciente["kt"].notna().sum() < MIN_GLOBAL:
        reciente = marco                      # historia corta: se usa toda
    # Solo filas con kt* utilizable, para que numerador y denominador cubran
    # exactamente los mismos instantes.
    util = reciente[reciente["kt"].notna()]
    if util.empty:
        return pd.Series(dtype=float)
    grupos = util.groupby("hora")
    perfil = grupos["g"].sum() / grupos["cs"].sum()
    return perfil.where(grupos.size() >= MIN_POR_HORA)


def _fin_de_serie(variable: str) -> pd.Timestamp:
    """Ultimo instante con dato. Default de `antes_de` cuando no se pasa."""
    serie = _data.cargar_serie(variable)
    return serie.index.max() if not serie.empty else pd.Timestamp.now(tz=config.TZ)


def kt_tipico(instante, variable: str = Variable.IRRADIANCIA.value,
              antes_de=None) -> float | None:
    """Que fraccion del techo suele pasar a la hora de `instante`.

    None si no hay historia para responderlo: quien llama decide que hacer con
    "no se", que es distinto de un cero.
    """
    t = pd.Timestamp(instante)
    t = t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)
    corte = antes_de if antes_de is not None else t

    perfil = perfil_horario(variable, corte)
    if perfil.empty:
        return None
    valor = perfil.get(t.hour)
    if valor is not None and pd.notna(valor):
        return float(valor)
    return kt_global(variable, corte)          # respaldo: climatologia sin hora


def kt_global(variable: str = Variable.IRRADIANCIA.value, antes_de=None) -> float | None:
    """kt* tipico del sitio SIN distinguir hora. Respaldo del perfil horario.

    Misma definicion que el perfil (suma sobre suma), para que caer al respaldo no
    cambie la escala de la anomalia. None si no hay historia suficiente.
    """
    marco = _marco(variable, antes_de if antes_de is not None else _fin_de_serie(variable))
    if marco.empty:
        return None
    util = marco[marco["kt"].notna()]
    if len(util) < MIN_GLOBAL or util["cs"].sum() == 0:
        return None
    return float(util["g"].sum() / util["cs"].sum())


def peso_persistencia(horizonte_seg: int, variable: str = Variable.IRRADIANCIA.value,
                      antes_de=None) -> float:
    """Cuanto de lo reciente sigue valiendo dentro de `horizonte_seg`.

    Se arma en dos pasos:

    1. CUANTO SE PARECE el cielo a si mismo a ese lag: la autocorrelacion de kt*,
       medida sobre el historico anterior al corte y acotada a [0, 1]. Es el peso
       que minimiza el error cuadratico de la combinacion convexa. Se acota por
       abajo en 0 porque una correlacion negativa significaria "invertir lo que se
       ve", que no tiene defensa fisica.
    2. CUANTO CONVIENE contraer a ese horizonte (`_rampa`): abajo de
       `H_SIN_CONTRAER` no conviene y el peso queda en 1; arriba de
       `H_CONTRACCION_PLENA` conviene del todo y manda la correlacion; en el medio
       se interpola.

    Sin historia suficiente devuelve `PESO_SIN_HISTORIA` (= 1, persistencia pura),
    que es el comportamiento anterior a este modulo.
    """
    rho = correlacion_a_lag(horizonte_seg, variable, antes_de)
    if rho is None:
        return PESO_SIN_HISTORIA
    r = _rampa(horizonte_seg)
    return float(rho + (1.0 - rho) * (1.0 - r))


def _rampa(horizonte_seg: float) -> float:
    """0 = no contraer (horizonte corto), 1 = contraer del todo (horizonte largo)."""
    lo, hi = H_SIN_CONTRAER, H_CONTRACCION_PLENA
    if horizonte_seg <= lo:
        return 0.0
    if horizonte_seg >= hi:
        return 1.0
    return (float(horizonte_seg) - lo) / (hi - lo)


def correlacion_a_lag(horizonte_seg: int, variable: str = Variable.IRRADIANCIA.value,
                      antes_de=None) -> float | None:
    """Cuanto se parece kt* a si mismo `horizonte_seg` despues, en [0, 1].

    Es el insumo crudo de `peso_persistencia`, expuesto aparte porque tambien es
    la respuesta a "que tan predecible es este sitio a este horizonte", que el
    diagnostico quiere poder mostrar sin la rampa encima.
    """
    marco = _marco(variable, antes_de if antes_de is not None else _fin_de_serie(variable))
    kt = marco["kt"] if not marco.empty else pd.Series(dtype=float)
    pasos = max(1, round(int(horizonte_seg) / pd.Timedelta(PASO).total_seconds()))
    if kt.notna().sum() < MIN_PARES:
        return None
    futuro = kt.shift(-pasos)
    if (kt.notna() & futuro.notna()).sum() < MIN_PARES:
        return None
    rho = kt.corr(futuro)
    return None if pd.isna(rho) else float(min(1.0, max(0.0, rho)))


def cuantiles_error(horizonte_seg: int, variable: str = Variable.IRRADIANCIA.value,
                    antes_de=None, regimen: str | None = None
                    ) -> tuple[float, float, float] | None:
    """Cuantiles 16, 50 y 84 del error EN kt* a `horizonte_seg`, medidos en el pasado.

    `regimen` ('calmo' | 'medio' | 'turbulento') acota la medicion a los momentos
    en que el cielo venia asi. Sin el, se mide una banda unica para todo, y eso
    estaba MAL CALIBRADO: a 1 h cubria 83 % con el cielo quieto (banda demasiado
    ancha, promete menos precision de la que hay) y 64 % con el cielo movido
    (demasiado angosta, promete mas de la que hay). Condicionarla la deja pareja
    (77/72/70) y en promedio mas angosta. Si el regimen pedido no tiene muestras
    suficientes se cae a la banda global, que es peor pero nunca falsa.

    El 16 y el 84 arman la banda. El 50 corrige el PUNTO: contraer hacia lo tipico
    usa como ancla un promedio, y en un sitio donde lo normal es estar tapado ese
    promedio queda por encima de la mayoria de los dias (unos pocos dias muy
    despejados lo levantan). Eso deja el pronostico corrido hacia arriba de forma
    pareja: medido, +18 W/m2 a 3 h. El cuantil 50 del error historico es
    exactamente cuanto hay que correrlo de vuelta, y aplicarlo mejora las tres
    metricas a la vez.

    Es la materia prima de una banda honesta. La banda anterior usaba la
    desviacion de kt* de la ultima hora, que mide cuanto vario el cielo recien y
    NO cuanto puede errar un pronostico a 3 h: por eso no crecia con el horizonte
    y su cobertura empirica caia a 29 % (a 3 h) y 24 % (a 6 h) cuando deberia
    rondar el 68 %.

    Aca el error se mide como lo que de verdad le pasa al metodo: se reconstruye
    el kt* estimado sobre todo el historico anterior al corte y se miran los
    residuos contra lo que ocurrio. Devuelve None si no hay historia suficiente.
    """
    # El import de `estimador` es local (en `_cuantiles_error`): ese modulo depende
    # de este, y traerlo arriba cerraria el ciclo. Es la unica dependencia
    # invertida y esta contenida ahi.
    corte = antes_de if antes_de is not None else _fin_de_serie(variable)
    clave = (variable, _corte(corte).isoformat(), int(horizonte_seg))
    if clave not in _CACHE_Q:
        if len(_CACHE_Q) >= _CACHE_MAX * 8:
            _CACHE_Q.pop(next(iter(_CACHE_Q)))
        # Se calculan TODOS los regimenes de una: comparten la pasada cara (el
        # estimador sobre el historico entero). Pedirlos de a uno multiplicaba
        # por cuatro el trabajo y hacia inviable el backtest.
        _CACHE_Q[clave] = _cuantiles_error(horizonte_seg, variable, corte)
    tabla = _CACHE_Q[clave] or {}
    resultado = tabla.get(regimen)
    if resultado is None and regimen is not None:
        resultado = tabla.get(None)          # respaldo: la banda global
    return resultado


def _cuantiles_error(horizonte_seg: int, variable: str, corte):
    """Cuantiles del error para la banda GLOBAL y para cada regimen, de una pasada.

    Devuelve {None: (q16,q50,q84), 'calmo': (...), 'medio': (...), 'turbulento': (...)},
    omitiendo los regimenes sin muestras suficientes. La clave `None` es la banda
    de siempre y siempre esta si hay historia: es el respaldo cuando un regimen no
    junta datos.
    """
    from pronostico.forecasters import estimador, riesgo

    marco = _marco(variable, corte)
    kt = marco["kt"] if not marco.empty else pd.Series(dtype=float)
    if kt.notna().sum() < MIN_PARES:
        return None

    pasos = max(1, round(int(horizonte_seg) / pd.Timedelta(PASO).total_seconds()))
    kt_hat = estimador.kt_a_persistir_serie(kt, horizonte_seg, variable=variable,
                                            antes_de=corte, centrar=False)
    residuo = (kt.shift(-pasos) - kt_hat)

    def _q(r):
        r = r.dropna()
        return None if len(r) < MIN_PARES else (
            float(r.quantile(Q_BAJO)), float(r.quantile(Q_CENTRO)), float(r.quantile(Q_ALTO)))

    tabla = {None: _q(residuo)}
    if tabla[None] is None:
        return None
    # La turbulencia es causal (solo mira hacia atras), asi que separar por ella
    # no mete informacion del futuro en la banda.
    etiquetas = riesgo.clasificar_serie(riesgo._turbulencia(kt), variable, corte)
    for nombre in riesgo.REGIMENES:
        q = _q(residuo[etiquetas == nombre])
        if q is not None:
            tabla[nombre] = q
    return tabla

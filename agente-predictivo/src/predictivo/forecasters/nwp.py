"""
ADDON opcional: modelo numerico del tiempo (Open-Meteo) como segunda opinion.

Que problema viene a atacar
---------------------------
El resto del sistema pronostica con UNA sola fuente: la propia serie del sensor.
Eso tiene un techo duro. Medido en San Carlos, la claridad del cielo se parece a
si misma un 13 % a 6 horas vista: pasado ese punto, mirar el pasado del sensor ya
no dice casi nada y el metodo se apoya en la climatologia. Para bajar de ahi hace
falta informacion que la serie NO contiene, o sea: alguien que haya mirado el
cielo desde afuera.

Que se midio, antes de construir esto
--------------------------------------
Se probaron las tres cosas que ofrece Open-Meteo para este sitio:

  * `shortwave_radiation` del modelo: correlacion 0,23 en kt* y un sesgo de
    +93 W/m2 (30 % del valor medio). El modelo global no resuelve la nubosidad
    convectiva de tarde y predice dias mucho mas soleados de los que hay.
    Sirve poco SOLO.
  * API de satelite: devuelve `nan` para estas coordenadas. Los datasets
    (SARAH3, Himawari, MTG) no cubren Centroamerica.
  * `cloud_cover`: correlacion -0,33 en kt*, y monotona de verdad (0-25 % de
    nubes -> kt* 0,72; 75-100 % -> kt* 0,46). ES la senal util, y es la que se usa.

Y una cosa mas, que cambio el resultado: se piden CINCO modelos, no uno. Ninguno
solo pasa de R2 0,13 (icon 0,129 · gem 0,121 · ecmwf 0,119 · meteofrance 0,125 ·
gfs 0,076); los cinco juntos llegan a 0,25 fuera de muestra. Donde los modelos
coinciden, la senal es real; donde discrepan, es ruido, y la regresion aprende a
descontarlo. Sale gratis: son cinco pedidos al mismo servicio.

Mezclado con el metodo propio, fuera de muestra: MAE -5 % a 3 h y **-10 % a 6 h**.
Es la unica mejora del sistema que viene de informacion NUEVA y no de usar mejor
la que ya habia.

Por que es un ADDON y no una pieza del sistema
-----------------------------------------------
Apagado por defecto (`NWP_HABILITADO`). El pronostico no puede depender de un
servicio de terceros: si Open-Meteo no responde, cambia su formato o deja de ser
gratis, el sistema sigue andando exactamente igual, solo que sin la segunda
opinion. Todas las funciones de aca fallan hacia None, nunca hacia una excepcion.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd

from predictivo import config
from predictivo.domain import Variable

ENV_HABILITADO = "NWP_HABILITADO"
ENV_TIMEOUT = "NWP_TIMEOUT_SEG"

# Dos endpoints con el mismo contrato: uno guarda lo que el modelo dijo en su
# momento (para evaluar honestamente sobre el historico) y el otro es el
# pronostico vigente. Cual se usa depende de la fecha pedida, no de una opcion.
URL_HISTORICO = "https://historical-forecast-api.open-meteo.com/v1/forecast"
URL_VIGENTE = "https://api.open-meteo.com/v1/forecast"

VARIABLES = "cloud_cover,shortwave_radiation"
TIMEOUT_SEG = 20.0

# Los modelos que se consultan. Se piden varios A PROPOSITO: ninguno solo llega a
# explicar el 13 % de la claridad de este sitio, y los cinco juntos llegan al 25 %.
# `jma` se excluye porque no devolvio solape util en estas coordenadas.
MODELOS = ("ecmwf_ifs025", "icon_seamless", "gem_seamless",
           "meteofrance_seamless", "gfs_seamless")

# Minimo de horas emparejadas para calibrar la traduccion nubosidad -> claridad.
MIN_CALIBRACION = 200
# Tope de kt* que puede proponer el modelo (mismo criterio que el resto).
KT_MAX = 1.3

_CACHE: dict[str, pd.DataFrame] = {}
_CACHE_MOS: dict[tuple[str, str], tuple[list[str], np.ndarray] | None] = {}
# El peso de mezcla recorre el historico aplicando el estimador: se cachea por
# (variable, dia, horizonte) igual que los cuantiles de la banda.
_CACHE_PESO: dict[tuple[str, str, int], float] = {}


def habilitado() -> bool:
    """True solo si alguien lo prendio explicitamente. Por defecto NO."""
    return os.environ.get(ENV_HABILITADO, "").strip().lower() in ("1", "true", "si", "on")


def reiniciar_cache() -> None:
    """Vacia los caches de proceso. Lo usan los tests."""
    _CACHE.clear()
    _CACHE_MOS.clear()
    _CACHE_PESO.clear()


def _parquet():
    return config.DATA_DIR / "nwp_openmeteo.parquet"


def _pedir(url: str, params: dict) -> dict | None:
    """GET con timeout. Devuelve None ante CUALQUIER problema: este modulo no
    puede tumbar un pronostico porque un servicio externo tuvo un mal dia."""
    consulta = urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(f"{url}?{consulta}",
                                    timeout=_envf(ENV_TIMEOUT, TIMEOUT_SEG)) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None


def _envf(clave: str, defecto: float) -> float:
    v = os.environ.get(clave)
    try:
        return float(v) if v not in (None, "") else defecto
    except ValueError:
        return defecto


def descargar(desde: str, hasta: str, vigente: bool = False) -> pd.DataFrame | None:
    """Nubosidad horaria de cada modelo, en hora local del sitio.

    Una columna por modelo (`nub_<modelo>`). `vigente=True` pide el pronostico
    actual en vez del archivo. Devuelve None si NINGUN modelo respondio; si
    responden algunos, se sigue con esos: perder un modelo del conjunto degrada la
    calidad, no el servicio.
    """
    columnas: dict[str, pd.Series] = {}
    for modelo in MODELOS:
        params = {
            "latitude": config.LAT, "longitude": config.LON,
            "hourly": VARIABLES, "timezone": config.TZ, "models": modelo,
        }
        if vigente:
            params["forecast_days"] = 3
        else:
            params["start_date"], params["end_date"] = desde, hasta
        crudo = _pedir(URL_VIGENTE if vigente else URL_HISTORICO, params)
        if not crudo or not crudo.get("hourly", {}).get("time"):
            continue
        h = crudo["hourly"]
        idx = pd.DatetimeIndex(h["time"]).tz_localize(config.TZ)
        nub = pd.to_numeric(h.get("cloud_cover"), errors="coerce")
        serie_modelo = pd.Series(nub, index=idx, dtype=float) / 100.0
        if serie_modelo.notna().any():
            columnas[f"nub_{modelo}"] = serie_modelo
    if not columnas:
        return None
    return pd.DataFrame(columnas)


def serie(desde=None, hasta=None, forzar: bool = False) -> pd.DataFrame | None:
    """Nubosidad horaria cacheada (memoria + parquet). None si nunca se pudo traer.

    El cache en disco existe para que evaluar el metodo no dependa de la red ni
    golpee el servicio miles de veces: un backtest recorre el mismo periodo una y
    otra vez.
    """
    if not forzar and "marco" in _CACHE:
        return _CACHE["marco"]
    pq = _parquet()
    if pq.exists() and not forzar:
        marco = pd.read_parquet(pq)
        marco.index = pd.DatetimeIndex(marco.index)
        if marco.index.tz is None:
            marco.index = marco.index.tz_localize(config.TZ)
        _CACHE["marco"] = marco
        return marco
    if desde is None or hasta is None:
        return None
    marco = descargar(str(desde), str(hasta))
    if marco is None:
        return None
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    marco.to_parquet(pq)
    _CACHE["marco"] = marco
    return marco


def _columnas(marco: pd.DataFrame) -> list[str]:
    return [c for c in marco.columns if c.startswith("nub_")]


def _mos(variable: str, antes_de) -> tuple[list[str], np.ndarray] | None:
    """Traduccion nubosidad -> claridad, ajustada contra la historia del SITIO.

    Los modelos no saben cuanta luz llega a este potrero: saben cuantas nubes
    pronostican. La traduccion se aprende de los datos propios (minimos cuadrados
    de kt* medido contra la nubosidad de cada modelo), usando SOLO horas
    anteriores al corte. Devuelve (columnas, coeficientes) o None si no hay con
    que calibrar.
    """
    from predictivo.forecasters import climatologia

    corte = climatologia._corte(antes_de)
    clave = (variable, corte.isoformat())
    if clave in _CACHE_MOS:
        return _CACHE_MOS[clave]

    resultado = None
    marco = serie()
    kt = _kt_horario(variable, corte) if marco is not None else None
    if kt is not None:
        cols = _columnas(marco)
        junto = marco[cols].join(kt.rename("kt"), how="inner").dropna()
        junto = junto[junto.index < corte]
        if len(junto) >= MIN_CALIBRACION and cols:
            A = np.column_stack([np.ones(len(junto))] + [junto[c].to_numpy() for c in cols])
            coef, *_ = np.linalg.lstsq(A, junto["kt"].to_numpy(), rcond=None)
            resultado = (cols, coef)
    _CACHE_MOS[clave] = resultado
    return resultado


def _kt_horario(variable: str, corte) -> pd.Series | None:
    """kt* medido, promediado por hora, para emparejar con la salida de los modelos.

    Se calcula como suma(medida)/suma(techo) de la hora, la misma definicion que
    usa `climatologia.perfil_horario`: dos definiciones distintas de kt* meterian
    un desfase sistematico en la calibracion que nadie veria.
    """
    from predictivo.forecasters import climatologia

    marco = climatologia._marco(variable, corte)
    if marco.empty:
        return None
    horas = marco.resample("1h").sum(numeric_only=True)
    return (horas["g"] / horas["cs"]).where(horas["cs"] > 0).dropna()


def kt_pronosticado(instante, variable: str = Variable.IRRADIANCIA.value,
                    antes_de=None) -> float | None:
    """Que claridad proponen los modelos para `instante`, en la escala del sitio.

    None si el addon esta apagado, si no hay dato para esa hora, o si no se pudo
    calibrar. Quien llama TIENE que poder seguir sin esto.
    """
    if not habilitado():
        return None
    marco = serie()
    if marco is None:
        return None
    mos = _mos(variable, antes_de if antes_de is not None else instante)
    if mos is None:
        return None
    cols, coef = mos

    t = pd.Timestamp(instante)
    t = t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)
    hora = t.floor("1h")
    if hora not in marco.index:
        return None
    fila = marco.loc[hora, cols]
    if fila.isna().any():
        return None
    kt = float(coef[0] + float(np.dot(coef[1:], fila.to_numpy(dtype=float))))
    return float(min(KT_MAX, max(0.0, kt)))


def peso_mezcla(horizonte_seg: int, variable: str = Variable.IRRADIANCIA.value,
                antes_de=None) -> float:
    """Cuanto pesa la opinion de los modelos frente al metodo propio, en [0, 1].

    Se DERIVA, igual que el peso de la persistencia: se resuelve por minimos
    cuadrados cual combinacion de los dos pronosticos habria acertado mejor en el
    pasado. Sale naturalmente creciente con el horizonte, y tiene sentido: a media
    hora los datos propios saben mucho mas que un modelo de malla gruesa, y a 6 h
    ya casi no saben nada.

    Encima se aplica la MISMA rampa que la contraccion (`climatologia._rampa`), y
    por la misma razon: abajo de una hora la opinion de un modelo de malla gruesa
    no le gana a mirar el sensor, y medido, dejarla entrar ahi empeoraba el error
    absoluto. Una sola regla para las dos mezclas, no dos umbrales distintos.

    0.0 si no se puede calcular, que equivale a ignorar el addon.
    """
    from predictivo.forecasters import climatologia, estimador

    if not habilitado():
        return 0.0
    marco = serie()
    if marco is None:
        return 0.0
    corte = climatologia._corte(antes_de if antes_de is not None
                                else climatologia._fin_de_serie(variable))
    clave = (variable, corte.isoformat(), int(horizonte_seg))
    if clave in _CACHE_PESO:
        return _CACHE_PESO[clave]
    # El acotado se repite aca a proposito: el contrato de esta funcion es
    # "devuelve algo en [0, 1]", y no puede depender de que el calculo interno se
    # porte bien. Mezclar con un peso fuera de rango no seria mezclar, seria
    # extrapolar.
    crudo = _peso_mezcla(horizonte_seg, variable, corte, marco)
    peso = float(min(1.0, max(0.0, crudo)) * climatologia._rampa(horizonte_seg))
    _CACHE_PESO[clave] = peso
    return peso


def _peso_mezcla(horizonte_seg, variable, corte, marco) -> float:
    """El calculo real de `peso_mezcla`, sin el cache.

    Se ajusta a la resolucion NATIVA de la serie (5 min), no por hora. Es el
    detalle que decide el resultado: promediar a hora antes de comparar le saca al
    metodo propio justo su ventaja de corto plazo (seguir el cielo minuto a
    minuto), y el ajuste le termina dando a los modelos un peso que no se ganaron.
    Medido, con el ajuste por hora el addon EMPEORABA todo por debajo de 2 h.
    """
    from predictivo.forecasters import climatologia, estimador

    mos = _mos(variable, corte)
    if mos is None:
        return 0.0

    kt_grid = climatologia._marco(variable, corte)["kt"]
    if kt_grid.notna().sum() < MIN_CALIBRACION:
        return 0.0
    pasos = max(1, round(int(horizonte_seg)
                         / pd.Timedelta(climatologia.PASO).total_seconds()))
    propio = estimador.kt_a_persistir_serie(kt_grid, horizonte_seg, variable=variable,
                                            antes_de=corte)
    cols, coef = mos
    # La nubosidad es horaria; se lleva a la rejilla nativa manteniendo el valor
    # de su hora (es una prevision horaria, no una medicion instantanea).
    modelo_h = pd.Series(coef[0] + marco[cols].to_numpy() @ coef[1:],
                         index=marco.index).clip(0, KT_MAX)
    modelo = modelo_h.reindex(kt_grid.index, method="ffill",
                              tolerance=pd.Timedelta("1h"))

    junto = pd.DataFrame({
        "real": kt_grid.shift(-pasos),      # lo que efectivamente paso al horizonte
        "propio": propio,
        "modelo": modelo.shift(-pasos),     # la prevision PARA ese instante
    }).dropna()
    junto = junto[junto.index < corte]
    if len(junto) < MIN_CALIBRACION:
        return 0.0
    # real = propio + w * (modelo - propio) -> minimos cuadrados en una variable.
    dif = (junto["modelo"] - junto["propio"]).to_numpy()
    denom = float(dif @ dif)
    if denom <= 0:
        return 0.0
    w = float((junto["real"] - junto["propio"]).to_numpy() @ dif / denom)
    return float(min(1.0, max(0.0, w)))

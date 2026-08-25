"""Forecasters de irradiancia (linea base estadistica, sin LLM).

El agente LLM de fases posteriores se comparara CONTRA estas lineas base. Aca
viven solo modelos deterministas y baratos:

  - smart_persistence : persistencia de la ANOMALIA de kt* respecto de lo normal
    de esa hora, contraida segun el horizonte y re-expandida con la geometria
    solar. Es el rival "listo" a batir.
  - naive_persistence : "el proximo valor sera igual al ultimo". Rival tonto.

Reparto de responsabilidades (una idea por modulo):

  climatologia : que es NORMAL en este sitio a esta hora y a este horizonte
  estimador    : COMO se estima el kt* que se lleva al futuro (unica fuente de
                 verdad del metodo; la comparte el backtest)
  persistence  : arma el pronostico de irradiancia con esas piezas
  humidity     : lo mismo para humedad de suelo (sin techo ni climatologia horaria)
  riesgo       : en que regimen esta el cielo y que tan probable es que CAMBIE
                 (alimenta la banda y la confianza, nunca el valor central)
  uncertainty  : cuanto se suele errar a ese horizonte
  base         : el contrato comun (`Forecaster`)
  nwp          : ADDON opcional, apagado por defecto: segunda opinion de modelos
                 numericos externos. Nada del resto depende de el.
"""
from predictivo.forecasters.base import Forecaster
from predictivo.forecasters.persistence import (
    naive_persistence, pronostico_detallado, smart_persistence,
)
from predictivo.forecasters.humidity import humidity_persistence
from predictivo.forecasters.uncertainty import banda_empirica, banda_sigma
from predictivo.forecasters import climatologia, estimador, nwp, riesgo

__all__ = [
    "smart_persistence", "naive_persistence", "humidity_persistence",
    "pronostico_detallado", "banda_empirica", "banda_sigma",
    "climatologia", "estimador", "nwp", "riesgo", "Forecaster",
]

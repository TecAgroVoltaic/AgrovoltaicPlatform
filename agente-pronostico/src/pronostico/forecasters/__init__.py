"""Forecasters de irradiancia (linea base estadistica, sin LLM).

El agente LLM de fases posteriores se comparara CONTRA estas lineas base. Aca
viven solo modelos deterministas y baratos:

  - smart_persistence : persistencia del indice de cielo despejado kt* (usa la
    geometria solar). Es el rival "listo" a batir.
  - naive_persistence : "el proximo valor sera igual al ultimo". Rival tonto.

`base.Forecaster` fija la interfaz comun; `uncertainty.banda_sigma`, la banda.
"""
from pronostico.forecasters.base import Forecaster
from pronostico.forecasters.persistence import naive_persistence, smart_persistence
from pronostico.forecasters.humidity import humidity_persistence
from pronostico.forecasters.uncertainty import banda_sigma

__all__ = [
    "smart_persistence", "naive_persistence", "humidity_persistence",
    "banda_sigma", "Forecaster",
]

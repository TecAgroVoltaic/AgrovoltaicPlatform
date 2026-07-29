"""
Agente LLM de pronostico de irradiancia (MVP).

Un agente que orquesta una herramienta fisica de pronostico: el LLM entiende la
pregunta, traduce el horizonte y redacta; los numeros salen de la herramienta
(cielo despejado + persistencia de kt*). El LLM nunca calcula.

Flujo de dependencias (una sola direccion):
    config -> domain -> {data, physics} -> forecasters -> tools -> agent -> cli
"""

__version__ = "0.1.0"

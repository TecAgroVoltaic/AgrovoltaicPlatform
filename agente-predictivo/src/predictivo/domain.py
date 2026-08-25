"""
Tipos del dominio — puros, sin logica ni dependencias.

Definen el vocabulario del sistema (que se pronostica y como se representa un
pronostico). No conocen la base de datos, ni la fisica, ni el LLM: son las
"palabras" que las capas de arriba usan para entenderse.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Variable(str, Enum):
    """Variables que el sistema puede pronosticar."""

    IRRADIANCIA = "irradiancia"
    HUMEDAD_SUELO = "humedad_suelo"


# Unidad fisica por variable (para el dict de salida del forecaster).
UNIDAD = {
    Variable.IRRADIANCIA.value: "W/m2",
    Variable.HUMEDAD_SUELO.value: "crudo",     # ADC sin calibrar (0..65535)
}


@dataclass(frozen=True)
class Pronostico:
    """Resultado de un pronostico, con su banda de incertidumbre.

    valor_esperado : valor central pronosticado (p.ej. GHI en W/m2).
    bajo, alto      : extremos de la banda (incertidumbre, p.ej. +-1 sigma).
    unidad          : unidad fisica (p.ej. "W/m2").
    momento         : instante al que corresponde el pronostico (tz-aware).
    contexto        : metadatos utiles para redactar (kt* reciente, si es de noche, etc.).
    """

    valor_esperado: float
    bajo: float
    alto: float
    unidad: str
    momento: datetime
    contexto: dict

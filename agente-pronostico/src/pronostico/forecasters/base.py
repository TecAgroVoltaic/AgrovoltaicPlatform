"""
Interfaz comun de los forecasters.

Un forecaster es cualquier objeto que sepa responder: "dado now y un horizonte,
cual sera el valor de esta variable?". Definir la interfaz como Protocol permite
sustituir el modelo (persistencia hoy; AutoARIMA / ML manana) sin tocar las capas
de arriba (tools, agent): todas dependen de esta firma, no de una implementacion.

Nota: los forecasters actuales de `persistence.py` son FUNCIONES con la firma
`(now, horizon_seconds, ...)`. Este Protocol describe la forma orientada a objetos
que adoptaran los modelos de la fase 2; se define aqui para fijar el contrato.
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable


@runtime_checkable
class Forecaster(Protocol):
    """Contrato minimo de un pronosticador."""

    def forecast(self, variable: str, horizon_seconds: int,
                 now: datetime | None = None) -> float:
        """Devuelve el valor pronosticado de `variable` en now + horizon_seconds.

        Sin fuga: la implementacion solo puede consumir datos con timestamp < now.
        """
        ...

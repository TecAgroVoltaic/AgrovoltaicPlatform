"""La maquina de estados de una alerta (contrato 4.2). Pura: no toca la base.

    nueva ──reconocer──▶ reconocida ──seguimiento──▶ en_seguimiento ──resolver──▶ resuelta
      │                     │                             │                          │
      └──descartar──▶ descartada ◀──────────────────────┘          reabrir ◀────────┘

Dos decisiones que el diagrama no fija y quedan escritas en el contrato:

  * `reabrir` lleva a `reconocida` (alguien ya la vio) y vale tambien desde
    `descartada`: "olvidar" por error tiene que poder deshacerse sin tocar la base.
  * `seguimiento` se repite: cada nota de seguimiento es un evento propio y la
    alerta sigue en `en_seguimiento`.

Una transicion fuera de la tabla es `TransicionInvalida`, que `historico.errores`
traduce a 409 con `{codigo, de, a}`.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

NUEVA, RECONOCIDA, EN_SEGUIMIENTO = "nueva", "reconocida", "en_seguimiento"
RESUELTA, DESCARTADA = "resuelta", "descartada"
ABIERTOS: tuple[str, ...] = (NUEVA, RECONOCIDA, EN_SEGUIMIENTO)
CERRADOS: tuple[str, ...] = (RESUELTA, DESCARTADA)
ESTADOS: tuple[str, ...] = ABIERTOS + CERRADOS

# Eventos que escribe el generador y no una persona.
EVENTO_CREADA, EVENTO_OCURRENCIA, EVENTO_NOTA = "creada", "ocurrencia", "nota"


class Accion(StrEnum):
    RECONOCER = "reconocer"
    SEGUIMIENTO = "seguimiento"
    RESOLVER = "resolver"
    DESCARTAR = "descartar"
    REABRIR = "reabrir"


@dataclass(frozen=True)
class Transicion:
    origenes: frozenset[str]
    destino: str
    evento: str


TRANSICIONES: dict[Accion, Transicion] = {
    Accion.RECONOCER: Transicion(frozenset({NUEVA}), RECONOCIDA, "reconocida"),
    Accion.SEGUIMIENTO: Transicion(frozenset({RECONOCIDA, EN_SEGUIMIENTO}),
                                   EN_SEGUIMIENTO, "seguimiento"),
    Accion.RESOLVER: Transicion(frozenset({EN_SEGUIMIENTO}), RESUELTA, "resuelta"),
    Accion.DESCARTAR: Transicion(frozenset(ABIERTOS), DESCARTADA, "descartada"),
    Accion.REABRIR: Transicion(frozenset(CERRADOS), RECONOCIDA, "reabierta"),
}


class TransicionInvalida(ValueError):
    """La accion no se puede aplicar desde el estado actual. 409."""

    codigo = "transicion_invalida"

    def __init__(self, de: str, a: str, accion: str) -> None:
        super().__init__(f"no se puede {accion} una alerta en estado {de!r}")
        self.datos = {"de": de, "a": a}


def transicion(estado: str, accion: Accion) -> Transicion:
    """La transicion que corresponde, o `TransicionInvalida`."""
    regla = TRANSICIONES[accion]
    if estado not in regla.origenes:
        raise TransicionInvalida(estado, regla.destino, accion.value)
    return regla

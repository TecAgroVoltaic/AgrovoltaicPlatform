"""Los tipos que comparten el generador y el store, y sus dos errores propios.

Viven aparte para que `evaluar` (que decide) y `store` (que escribe) hablen el
mismo idioma sin importarse entre si.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date


class AlertaInexistente(ValueError):
    """El id no corresponde a ninguna alerta. 404."""

    codigo = "alerta_inexistente"

    def __init__(self, alerta_id: int) -> None:
        super().__init__(f"no existe la alerta {alerta_id}")
        self.datos = {"id": alerta_id}


class AlertaAbiertaExistente(ValueError):
    """Reabrir chocaria con otra alerta abierta de la misma clave. 409.

    El indice unico de la tabla lo impediria igual; esto lo dice con nombre.
    """

    codigo = "alerta_abierta_existente"

    def __init__(self, alerta_id: int, abierta_id: int) -> None:
        super().__init__(f"la alerta {alerta_id} no se puede reabrir: ya hay otra "
                         f"abierta con la misma clave (id {abierta_id})")
        self.datos = {"id": alerta_id, "abierta_id": abierta_id}


@dataclass(frozen=True)
class AlertaAbierta:
    """Lo que el generador necesita saber de una alerta abierta."""

    id: int
    clave: str
    estado: str
    fecha_inicio: date
    fecha_fin: date
    ocurrencias: int
    evidencia: Mapping

    @property
    def fechas(self) -> set[date]:
        """Los dias ya contados. Es lo que hace idempotente la re-evaluacion."""
        return {date.fromisoformat(f) for f in self.evidencia.get("fechas", [])}


@dataclass(frozen=True)
class EstadoActual:
    """La foto de la base con que se planifica, tomada dentro de la transaccion."""

    abiertas: Mapping[str, AlertaAbierta] = field(default_factory=dict)
    # Por clave, la ultima `fecha_fin` de sus alertas cerradas.
    fin_cerradas: Mapping[str, date] = field(default_factory=dict)
    # (alerta_id, fecha_fin) que ya recibieron la nota automatica.
    notas_previas: frozenset[tuple[int, date]] = frozenset()


@dataclass(frozen=True)
class NuevaAlerta:
    clave: str
    tipo: str
    severidad: str
    titulo: str
    descripcion: str
    fuente: str
    variable: str
    fecha_inicio: date
    fecha_fin: date
    ocurrencias: int
    evidencia: dict


@dataclass(frozen=True)
class SumaDeOcurrencias:
    alerta_id: int
    fechas_nuevas: tuple[date, ...]
    fecha_inicio: date
    fecha_fin: date
    ocurrencias: int
    evidencia: dict


@dataclass(frozen=True)
class NotaAutomatica:
    alerta_id: int
    sin_ocurrencias_desde: date

    @property
    def texto(self) -> str:
        return (f"sin ocurrencias desde {self.sin_ocurrencias_desde.isoformat()}; "
                f"se puede resolver")


@dataclass(frozen=True)
class Plan:
    """Lo que el generador decidio hacer. El store lo aplica en una transaccion."""

    crear: tuple[NuevaAlerta, ...] = ()
    sumar: tuple[SumaDeOcurrencias, ...] = ()
    notas: tuple[NotaAutomatica, ...] = ()
    claves_evaluadas: int = 0

"""Tipos, topes y error del PlanExportacion v1 (contrato §3)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from historico.catalogo_datos import VariableDatos

VERSION = 1
PASOS_S = (0, 60, 300, 900, 3600, 86400)       # 0 = crudo
FORMATOS = ("csv", "dat", "mat")
ANCHO, LARGO = "ancho", "largo"
FORMAS = (ANCHO, LARGO)
PROMEDIO, MINIMO, MAXIMO, SUMA, ULTIMO = "promedio", "min", "max", "suma", "ultimo"
AGREGACIONES = (PROMEDIO, MINIMO, MAXIMO, SUMA, ULTIMO)
MAX_COLUMNAS = 12
MAX_ARCHIVOS = 8
MAX_PLAN_BYTES = 4096            # codificado (base64url sin relleno)
UMBRAL_CONFIRMACION = 100_000    # total de filas por encima del cual se pide confirmar
TOPE_DURO = 2_000_000            # total de filas por encima del cual el plan se rechaza
COLUMNA_TIEMPO = "fecha_hora"
COLUMNAS_LARGO = (COLUMNA_TIEMPO, "fuente", "variable", "caja", "valor", "unidad")


class PlanInvalido(ValueError):
    """El plan no se puede servir. `codigo` es el contrato estable (400 en la API)."""

    def __init__(self, codigo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.codigo = codigo


@dataclass(frozen=True)
class ColumnaPlan:
    variable: VariableDatos
    agregacion: str
    nombre: str                  # nombre de la columna en formato ancho
    alias: str | None = None

    @property
    def etiqueta_larga(self) -> str:
        """Lo que va en la columna `variable` del formato largo."""
        return self.alias or self.variable.clave


@dataclass(frozen=True)
class ArchivoPlan:
    indice: int
    nombre: str                  # sin extension, ya saneado y unico dentro del plan
    formato: str
    forma: str
    columnas: tuple[ColumnaPlan, ...]

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre}.{self.formato}"

    @property
    def fuentes(self) -> list[str]:
        vistas: list[str] = []
        for c in self.columnas:
            if c.variable.fuente not in vistas:
                vistas.append(c.variable.fuente)
        return vistas


@dataclass(frozen=True)
class Plan:
    desde: date                  # inclusivo
    hasta: date                  # inclusivo
    paso_s: int
    archivos: tuple[ArchivoPlan, ...]
    original: dict               # el JSON tal cual llego (para reemitir la URL)

    @property
    def inicio(self) -> datetime:
        """Primer instante (hora local CR naive)."""
        return datetime.combine(self.desde, time.min)

    @property
    def fin(self) -> datetime:
        """Fin EXCLUSIVO (medianoche local del dia siguiente a `hasta`)."""
        return datetime.combine(self.hasta + timedelta(days=1), time.min)

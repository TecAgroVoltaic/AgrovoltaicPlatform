"""Constantes, motivos y conversiones que comparten las hojas. Puro."""
from __future__ import annotations

from collections import Counter

from historico.analitica import energia, rendimiento

HORAS_POR_LECTURA = energia.HORAS_POR_FILA
WH_POR_KWH = 1000.0

INCLINADO, VERTICAL = rendimiento.INCLINADO, rendimiento.VERTICAL
CONTADOR, INTEGRAL = rendimiento.CONTADOR, rendimiento.INTEGRAL
GHI, POA = rendimiento.GHI, rendimiento.POA_BIFACIAL

SIN_FILAS = "sin datos ese día"
SIN_CONTADOR = "día apto, pero sin contador DC: el PR solo sale por integral"
PR_IMPOSIBLE = "PR mayor a 1: físicamente imposible, revisar la irradiancia"
PARADA = "planta parada ese día: el PR mide la parada, no los paneles"


def a_float(valor) -> float | None:
    return None if valor is None else float(valor)


def wh_a_kwh(wh) -> float | None:
    return None if wh is None else float(wh) / WH_POR_KWH


def suma_presente(filas: list[dict], clave: str) -> float | None:
    """Suma de los valores presentes; None si no hay ninguno (no cero)."""
    valores = [f[clave] for f in filas if f.get(clave) is not None]
    return sum(valores) if valores else None


def conteo(dias: list[dict], clave: str) -> Counter:
    return Counter(d[clave] for d in dias if d[clave])

"""La cadencia REAL de un periodo y cuantas lecturas deberia tener un dia."""
from __future__ import annotations

from datetime import date

from historico.analitica.completitud.constantes import (
    _CAMPO_CADENCIA,
    _CAMPO_FILAS,
    _SEGUNDOS_POR_HORA,
    CADENCIA_NOMINAL_SEG,
    MEDIDA,
    NOMINAL,
)


def _fecha(valor: date | str) -> date:
    """La fecha, venga como `date` o como el ISO que devuelve `db.query`."""
    return valor if isinstance(valor, date) else date.fromisoformat(str(valor)[:10])


def _fraccion(real: int, esperado: int) -> float | None:
    """La razon real/esperado, o None si no hay contra que comparar."""
    return round(real / esperado, 3) if esperado else None


def cadencia(dias: list[dict], fuente: str) -> tuple[int, str]:
    """Cada cuantos segundos hay una fila guardada, DE VERDAD, en este periodo.

    Es la moda de los saltos reales entre filas consecutivas, ponderada por filas:
    robusta frente a un dia suelto con cadencia rara, que si pesara igual que un mes
    entero desplazaria la referencia. Empate: gana la mas fina, que es la exigente.
    """
    peso: dict[int, int] = {}
    for dia in dias:
        seg = dia.get(_CAMPO_CADENCIA[fuente])
        if seg:
            peso[int(seg)] = peso.get(int(seg), 0) + (dia.get(_CAMPO_FILAS[fuente]) or 0)
    if not peso:
        return CADENCIA_NOMINAL_SEG[fuente], NOMINAL
    return max(peso.items(), key=lambda par: (par[1], -par[0]))[0], MEDIDA


def esperadas(horas_sol: float, cadencia_seg: int) -> int:
    """Lecturas que deberia tener un dia de `horas_sol` a esa cadencia."""
    return int(horas_sol * _SEGUNDOS_POR_HORA / cadencia_seg) if cadencia_seg else 0

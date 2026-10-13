"""La rejilla comun: intervalos de `paso_s` sobre hora LOCAL, etiquetados por su INICIO.

Todas las fuentes se llevan a la misma rejilla anclada en la medianoche local
(todo paso admitido divide 86.400 s, asi que `floor(epoch_local / paso)` cae en los
mismos bordes desde cualquier medianoche). En SQL y en Python es la MISMA cuenta.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Iterable, Iterator

_EPOCA = datetime(1970, 1, 1)


def inicio_intervalo(dt: datetime, paso_s: int) -> datetime:
    """Inicio del intervalo que contiene `dt` (naive local)."""
    seg = (dt - _EPOCA).total_seconds()
    return _EPOCA + timedelta(seconds=math.floor(seg / paso_s) * paso_s)


def n_intervalos(inicio: datetime, fin: datetime, paso_s: int) -> int:
    return max(0, math.ceil((fin - inicio).total_seconds() / paso_s))


def rejilla(inicio: datetime, fin: datetime, paso_s: int) -> Iterator[datetime]:
    t, paso = inicio, timedelta(seconds=paso_s)
    while t < fin:
        yield t
        t += paso


def pivot(filas_sql: Iterable[tuple] | None, n_sql: int, inicio: datetime, fin: datetime,
          paso_s: int, api: list[dict[datetime, float]], orden: list[tuple[str, int]]
          ) -> Iterator[tuple]:
    """Filas del formato ancho: `fecha_hora` + una celda por columna, en el orden pedido.

    `filas_sql`: (b, v0, v1, ...) ya sobre la rejilla completa (una fila por intervalo),
    o None si no hay columnas SQL. `api`: un dict intervalo -> valor por columna API.
    `orden`: por columna del archivo, ('sql', k) o ('api', k). Celda sin dato = None:
    nunca se rellena."""
    filas = iter(filas_sql) if filas_sql is not None else ((t,) + (None,) * n_sql
                                                            for t in rejilla(inicio, fin, paso_s))
    for fila in filas:
        t = fila[0]
        celdas = [fila[1 + k] if via == "sql" else api[k].get(t) for via, k in orden]
        yield (t, *celdas)

"""Particion del rango en tramos/ventanas y ejecucion acotada en paralelo."""
from __future__ import annotations

import math
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from itertools import islice

from historico.agrodash_api.cliente import MAX_PUNTOS_LLAMADA


def _parse_bucket(texto: str) -> datetime:
    return datetime.fromisoformat(texto)   # hora local naive, a veces con fraccion (.500)


def tramos(desde: datetime, hasta: datetime, paso_seg: int) -> list[tuple[datetime, datetime, int]]:
    """Parte [desde, hasta) en tramos (ini, fin, puntos) de <= MAX_PUNTOS_LLAMADA buckets
    de `paso_seg` cada uno (para resoluciones fijas, no para crudo)."""
    ancho = timedelta(seconds=paso_seg * MAX_PUNTOS_LLAMADA)
    out, ini = [], desde
    while ini < hasta:
        fin = min(ini + ancho, hasta)
        out.append((ini, fin, max(1, math.ceil((fin - ini).total_seconds() / paso_seg))))
        ini = fin
    return out


def ventanas(desde: datetime, hasta: datetime, k: int) -> list[tuple[datetime, datetime]]:
    """Parte [desde, hasta) en k ventanas iguales, contiguas."""
    k = max(1, k)
    total = (hasta - desde) / k
    cortes = [desde + total * i for i in range(k)] + [hasta]
    return [(cortes[i], cortes[i + 1]) for i in range(k)]


def _map_ventana(pool: ThreadPoolExecutor, fn, items, ventana: int):
    """Como pool.map (en orden) pero con a lo sumo `ventana` tareas en vuelo: no lanza
    todo de golpe (una vista previa de 5 filas no debe disparar 491 sensores)."""
    it = iter(items)
    pend: deque = deque(pool.submit(fn, x) for x in islice(it, ventana))
    while pend:
        f = pend.popleft()
        nxt = next(it, None)
        if nxt is not None:
            pend.append(pool.submit(fn, nxt))
        yield f.result()

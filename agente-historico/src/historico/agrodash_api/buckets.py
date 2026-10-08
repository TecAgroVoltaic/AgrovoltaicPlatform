"""Buckets de UN sensor: por tramos de ancho fijo o crudo adaptativo con biseccion.

Las llamadas entre estas funciones (`_tramo`, `_crudo`, `_crudo_ventana`) se
resuelven en la fachada del paquete: es el punto que sustituyen las pruebas para
no salir a la red, y tiene que seguir surtiendo efecto aunque vivan aca.
"""
from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Iterator

from historico.agrodash_api.cliente import MAX_PROFUNDIDAD, MAX_PUNTOS_LLAMADA, OBJETIVO_CRUDO, PARALELO, _get
from historico.agrodash_api.particion import tramos, ventanas


def _fachada():
    from historico import agrodash_api

    return agrodash_api


def _tramo(sensor_id: str, ini: datetime, fin: datetime, puntos: int) -> list[dict]:
    datos = _get("readings", sensor_id=sensor_id, **{"from": ini.isoformat(timespec="seconds"),
                                                      "to": fin.isoformat(timespec="seconds")},
                 points=puntos)
    return [b for b in (datos or []) if b and b.get("n")]     # descarta buckets vacios (n=0)


def conteo(sensor_id: str, desde: datetime, hasta: datetime) -> int:
    """Cantidad EXACTA de lecturas del sensor en el rango: una llamada gruesa, suma de `n`."""
    return sum(int(b.get("n") or 0) for b in _fachada()._tramo(sensor_id, desde, hasta, MAX_PUNTOS_LLAMADA))


def _crudo_ventana(sensor_id: str, ini: datetime, fin: datetime, profundidad: int = 0) -> list[dict]:
    """Lecturas crudas de una ventana: si algun bucket mezcla >1 lectura, biseca (secuencial,
    es raro: solo pasa cuando la cadencia es muy irregular)."""
    buckets = _fachada()._tramo(sensor_id, ini, fin, MAX_PUNTOS_LLAMADA)
    if profundidad >= MAX_PROFUNDIDAD or all((b.get("n") or 0) <= 1 for b in buckets):
        return buckets
    mitad = ini + (fin - ini) / 2
    return (_fachada()._crudo_ventana(sensor_id, ini, mitad, profundidad + 1)
            + _fachada()._crudo_ventana(sensor_id, mitad, fin, profundidad + 1))


def _crudo(sensor_id: str, desde: datetime, hasta: datetime) -> list[dict]:
    """Crudo adaptativo: 1) llamada gruesa -> conteo exacto N; si ya vino sin mezclas, listo.
    2) k = ceil(N / OBJETIVO_CRUDO) ventanas iguales en paralelo; 3) bisecar las que mezclen."""
    gruesa = _fachada()._tramo(sensor_id, desde, hasta, MAX_PUNTOS_LLAMADA)
    if all((b.get("n") or 0) <= 1 for b in gruesa):
        return gruesa
    n_total = sum(int(b.get("n") or 0) for b in gruesa)
    k = max(2, math.ceil(n_total / OBJETIVO_CRUDO))
    vs = ventanas(desde, hasta, k)
    with ThreadPoolExecutor(max_workers=min(PARALELO, k)) as pool:
        partes = list(pool.map(lambda v: _fachada()._crudo_ventana(sensor_id, v[0], v[1], 1), vs))
    return [b for parte in partes for b in parte]


def lecturas(sensor_id: str, desde: datetime, hasta: datetime, paso_seg: int) -> Iterator[dict]:
    """Buckets de UN sensor en [desde, hasta) (hora local naive), en orden temporal.
    paso_seg=0 -> crudo adaptativo (cada bucket = una lectura); >0 -> buckets de ese ancho,
    pedidos por tramos en paralelo."""
    if not paso_seg:
        yield from _fachada()._crudo(sensor_id, desde, hasta)
        return
    lista = tramos(desde, hasta, paso_seg)
    if len(lista) <= 1:
        for ini, fin, puntos in lista:
            yield from _fachada()._tramo(sensor_id, ini, fin, puntos)
        return
    with ThreadPoolExecutor(max_workers=min(PARALELO, len(lista))) as pool:
        for buckets in pool.map(lambda t: _fachada()._tramo(sensor_id, *t), lista):
            yield from buckets

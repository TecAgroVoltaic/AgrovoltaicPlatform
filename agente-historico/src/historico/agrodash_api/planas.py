"""Filas planas para la exportacion: lecturas de todos los sensores, conteos y catalogo.

`sensores`, `lecturas` y `conteo` se resuelven en la fachada del paquete, que es el
punto que sustituyen las pruebas de la exportacion para no salir a la red.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Iterator

from historico.agrodash_api.buckets import _fachada
from historico.agrodash_api.cliente import PARALELO, SENSORES_PARALELO
from historico.agrodash_api.particion import _map_ventana, _parse_bucket


def filas(sel_nombres: list[str], desde: datetime, hasta: datetime,
          filtros: dict[str, list[str]] | None, paso_seg: int, limite: int | None = None
          ) -> Iterator[tuple]:
    """Filas planas (tuplas en el orden de `sel_nombres`) de todos los sensores que
    pasan los filtros: por sensor (SENSORES_PARALELO a la vez, en orden) y luego por
    tiempo. Campos: ts (datetime naive local CR), caja, sensor_numero, sensor_tipo,
    sensor_id, valor (promedio del bucket; = la lectura en crudo), n, minimo, maximo, desvio."""
    def por_sensor(s: dict) -> list[tuple]:
        out = []
        for b in api.lecturas(s["sensor_id"], desde, hasta, paso_seg):
            fila = {"ts": _parse_bucket(b["bucket"]), **s,
                    "valor": b.get("value"), "n": b.get("n"),
                    "minimo": b.get("min"), "maximo": b.get("max"), "desvio": b.get("std")}
            out.append(tuple(fila[c] for c in sel_nombres))
        return out

    api = _fachada()
    emitidas = 0
    pool = ThreadPoolExecutor(max_workers=SENSORES_PARALELO)
    try:
        for filas_sensor in _map_ventana(pool, por_sensor, api.sensores(filtros), SENSORES_PARALELO):
            for f in filas_sensor:
                yield f
                emitidas += 1
                if limite and emitidas >= limite:
                    return
    finally:
        # Si quien consume corto (vista previa satisfecha, cliente desconectado), no
        # esperar a los sensores en cola: se cancelan; los en vuelo terminan solos.
        pool.shutdown(wait=False, cancel_futures=True)


def conteos(sensores_: list[dict], desde: datetime, hasta: datetime) -> list[int]:
    """Conteo exacto de lecturas por sensor, en paralelo (para `estimar`)."""
    api = _fachada()
    with ThreadPoolExecutor(max_workers=min(SENSORES_PARALELO * PARALELO, max(1, len(sensores_)))) as pool:
        return list(pool.map(lambda s: api.conteo(s["sensor_id"], desde, hasta), sensores_))


def filas_sensores(sel_nombres: list[str], filtros: dict[str, list[str]] | None) -> Iterator[tuple]:
    """Catalogo de sensores como filas planas (dataset sin tiempo)."""
    for s in _fachada().sensores(filtros):
        yield tuple(s[c] for c in sel_nombres)

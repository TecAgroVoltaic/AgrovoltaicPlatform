"""
Fuente Postgres: AgroDash directo (Cartago por tailnet) o una replica del dump.

Este modulo es el camino que existia dentro de `etl.py` hasta 2026-08-25, movido
sin cambiarle nada: el mismo SQL, el mismo cursor server-side y el mismo
`SET SESSION ... READ ONLY`. Se movio para que el ETL pueda elegir entre este y la
API publica sin tener dos ramas de codigo adentro.

Sigue siendo la fuente de MAYOR fidelidad: es la unica que entrega `readings.id`
(trazabilidad) y `timestamp_real` aparte de `created_at`. La API publica no expone
ninguno de los dos.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from itertools import count
from typing import Iterator

import psycopg

# Trae TODOS los canales (sensor_id) que casen caja+tipo; el store los desambigua
# por serie. ORDER BY created_at para que el streaming sea estable entre corridas.
_SQL_SOURCE = """
    SELECT r.id::text, b.name, s.id::text, s.type,
           r.created_at, r.timestamp_real, r.value
    FROM readings r
    JOIN sensors s ON s.id = r.sensor_id
    JOIN boxes   b ON b.id = s.box_id
    WHERE b.name = %s AND s.type = %s
      AND r.created_at >= %s
    ORDER BY r.created_at
"""

# Cuantas filas trae por viaje el cursor server-side (control de memoria).
ITERSIZE = 20000


class FuentePostgres:
    """Lee `readings` por cursor server-side: streamea, no carga todo en RAM."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn
        # Los cursores con nombre necesitan uno UNICO por consulta viva. Un
        # contador evita depender del nombre de la caja (que trae espacios).
        self._seq = count()

    def lecturas(self, caja: str, tipo: str, desde: datetime) -> Iterator[tuple]:
        """(origen_id, caja, sensor_id, sensor_type, ts, ts_medicion, valor)."""
        with self._conn.cursor(name=f"src_{next(self._seq)}") as cur:
            cur.itersize = ITERSIZE
            cur.execute(_SQL_SOURCE, (caja, tipo, desde))
            for rid, box, sid, styp, creado, medido, valor in cur:
                yield (rid, box, sid, styp, creado, medido, valor)
        self._conn.rollback()          # cierra la txn read-only de la fuente


@contextmanager
def abrir(url: str, timeout_seg: int = 15) -> Iterator[FuentePostgres]:
    """Conecta en SOLO LECTURA, con corte rapido si la fuente no responde.

    `connect_timeout` explicito: el timer corre cada 15 min, no tiene sentido
    colgarse hasta el default del sistema si la DB esta apagada.
    """
    with psycopg.connect(url, connect_timeout=timeout_seg) as conn:
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        conn.commit()
        yield FuentePostgres(conn)

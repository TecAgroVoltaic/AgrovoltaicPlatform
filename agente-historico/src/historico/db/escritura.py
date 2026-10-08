"""Escritura: SOLO para el barrido por lotes y las alertas, nunca para una tool.

Todo va por el pool con escritura (`conexion._get_pool_rw`) y cada escritura
invalida la cache de lecturas, porque lo que se leyo antes ya no es cierto.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from historico import cache
from historico.db import conexion
from historico.db.filas import _filas


def ejecutar(sql: str, params: tuple = ()) -> int:
    """Escritura suelta. Devuelve filas afectadas. NO la usan las herramientas."""
    with conexion._get_pool_rw().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            filas = cur.rowcount
    cache.invalidar_todo()
    return filas


def ejecutar_muchos(sql: str, filas: list[tuple]) -> int:
    """Escritura por lote en UNA transaccion. Devuelve cuantas filas se mandaron.

    Un `executemany` en vez de N viajes: contra el pooler de Supabase esa es la
    diferencia entre segundos y minutos.
    """
    if not filas:
        return 0
    with conexion._get_pool_rw().connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, filas)
    cache.invalidar_todo()
    return len(filas)


class Transaccion:
    """Lo que se puede hacer dentro de `transaccion()`: leer y escribir en el mismo BEGIN."""

    def __init__(self, conn) -> None:
        self._conn = conn

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return _filas(cur)

    def uno(self, sql: str, params: tuple = ()) -> dict:
        filas = self.query(sql, params)
        return filas[0] if filas else {}

    def ejecutar_muchos(self, sql: str, filas: list[tuple]) -> int:
        if filas:
            with self._conn.cursor() as cur:
                cur.executemany(sql, filas)
        return len(filas)


@contextmanager
def transaccion() -> Iterator[Transaccion]:
    """Escritura de VARIOS pasos que se aplica entera o no se aplica.

    La usan las alertas, que necesitan lo que `ejecutar` no da: `RETURNING` (el id
    de la alerta recien creada para colgarle su evento) y `SELECT ... FOR UPDATE`
    (que dos personas no transicionen la misma alerta a la vez). Si algo revienta
    a mitad, el `with` hace ROLLBACK y la alerta no queda sin su evento.
    """
    with conexion._get_pool_rw().connection() as conn:
        with conn.transaction():
            yield Transaccion(conn)
    cache.invalidar_todo()

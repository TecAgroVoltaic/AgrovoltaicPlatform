"""Acceso a la DB — responsabilidad unica: consultar y escribir hallazgos.

Se diferencia del `db.py` del analizador en una cosa: aquel es SOLO LECTURA porque
sirve preguntas; este ESCRIBE, porque el Comparador deja un store de hallazgos.
El pool evita pagar los ~700 ms de handshake TLS contra el pooler en cada consulta.

Todo pasa por consultas parametrizadas (%s): sin concatenar SQL a mano.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from comparador import config

_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            config.database_url(),
            min_size=1, max_size=4, timeout=15,
            kwargs={"autocommit": True, "row_factory": dict_row},
            check=ConnectionPool.check_connection,
            name="comparador",
        )
    return _pool


def cerrar() -> None:
    """Cierra el pool. Para el CLI, que si tiene un final."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def _limpiar(v):
    """Valor JSON-serializable: Decimal->float, datetime/date->ISO, resto igual."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Consulta que devuelve filas como lista de dicts JSON-serializables."""
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return [{k: _limpiar(v) for k, v in fila.items()} for fila in cur.fetchall()]


def uno(sql: str, params: tuple = ()) -> dict:
    """Como query() pero para consultas de UNA fila. {} si no hay."""
    filas = query(sql, params)
    return filas[0] if filas else {}


def ejecutar(sql: str, params: tuple = ()) -> int:
    """Escritura suelta. Devuelve filas afectadas."""
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount


def ejecutar_muchos(sql: str, filas: list[tuple]) -> int:
    """Escritura por lote en UNA transaccion. Devuelve cuantas filas se mandaron.

    Se usa para los upserts del barrido: un `executemany` en vez de N viajes, que
    contra el pooler de Supabase es la diferencia entre segundos y minutos.
    """
    if not filas:
        return 0
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, filas)
    return len(filas)

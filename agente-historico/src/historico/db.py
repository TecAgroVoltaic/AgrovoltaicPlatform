"""Acceso a la DB — responsabilidad unica: consultar, y escribir solo los hallazgos.

DOS POOLS, y la separacion es una garantia, no una optimizacion:

  * `query()`/`uno()` van por un pool de **SOLO LECTURA**. Es el que usan las
    herramientas, o sea todo lo que el LLM puede disparar. Una tool no puede
    escribir en la base porque su conexion no se lo permite, no porque el prompt
    se lo pida. Misma idea que restringir el juego de herramientas.
  * `ejecutar()`/`ejecutar_muchos()` van por un pool con escritura. Los usa UNICAMENTE
    el barrido por lotes (`historico.calidad.barrido`), que corre por cron y jamas
    desde una pregunta.

Usa un POOL de conexiones (psycopg_pool): abrir una conexion al pooler de Supabase
cuesta ~700 ms (TLS + auth + latencia a us-east-1), mucho mas que la consulta en si
(~100-200 ms). Reusar conexiones evita pagar ese costo en cada request -> la UI deja
de esperar segundos por panel. El pool es thread-safe (FastAPI corre los `def` en su
threadpool), fija el modo SOLO LECTURA una vez por conexion (configure) y valida la
conexion antes de prestarla (check) por si el pooler cerro una inactiva.

Todas las tools pasan por `query()`/`uno()`, con parametros (%s) -> sin inyeccion.
Devuelve filas ya JSON-serializables (Decimal->float, fecha->ISO).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from psycopg_pool import ConnectionPool

from historico import config

# Pools perezosos (se abren en la 1.ª consulta, no al importar -> no exigen DB en tests).
_pool: ConnectionPool | None = None        # solo lectura: herramientas
_pool_rw: ConnectionPool | None = None     # escritura: solo el barrido


def _solo_lectura(conn) -> None:
    """Fija la transaccion en SOLO LECTURA una vez, al crear la conexion."""
    conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            config.database_url(),
            min_size=1, max_size=6, timeout=15,
            kwargs={"autocommit": True},
            configure=_solo_lectura,
            check=ConnectionPool.check_connection,  # valida (SELECT 1) antes de prestar
            name="historico-ro",
        )
    return _pool


def _limpiar(v):
    """Valor JSON-serializable: Decimal->float, datetime/date->ISO, resto igual."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Ejecuta una consulta de SOLO LECTURA y devuelve filas como lista de dicts.

    Toma una conexion prestada del pool (se devuelve sola al salir del `with`)."""
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [d.name for d in cur.description]
            return [{c: _limpiar(v) for c, v in zip(cols, row)} for row in cur.fetchall()]


def uno(sql: str, params: tuple = ()) -> dict:
    """Como query() pero para consultas de UNA fila (agregados). {} si vacio."""
    filas = query(sql, params)
    return filas[0] if filas else {}


# ── Escritura: SOLO para el barrido por lotes ────────────────────────────────
def _get_pool_rw() -> ConnectionPool:
    global _pool_rw
    if _pool_rw is None:
        _pool_rw = ConnectionPool(
            config.database_url(),
            min_size=1, max_size=2, timeout=15,
            kwargs={"autocommit": True},
            check=ConnectionPool.check_connection,
            name="historico-rw",
        )
    return _pool_rw


def ejecutar(sql: str, params: tuple = ()) -> int:
    """Escritura suelta. Devuelve filas afectadas. NO la usan las herramientas."""
    with _get_pool_rw().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount


def ejecutar_muchos(sql: str, filas: list[tuple]) -> int:
    """Escritura por lote en UNA transaccion. Devuelve cuantas filas se mandaron.

    Un `executemany` en vez de N viajes: contra el pooler de Supabase esa es la
    diferencia entre segundos y minutos.
    """
    if not filas:
        return 0
    with _get_pool_rw().connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, filas)
    return len(filas)


def cerrar() -> None:
    """Cierra los pools. Para el CLI, que si tiene un final."""
    global _pool, _pool_rw
    for nombre in ("_pool", "_pool_rw"):
        p = globals()[nombre]
        if p is not None:
            p.close()
            globals()[nombre] = None

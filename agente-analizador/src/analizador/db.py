"""Acceso a la DB — responsabilidad unica: consulta parametrizada de SOLO LECTURA.

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
from uuid import uuid4

from psycopg_pool import ConnectionPool

from analizador import config

# Un pool perezoso POR FUENTE (se abre en la 1.ª consulta, no al importar -> no
# exige DB en tests). Hoy la unica DB es 'supabase' (la PV de San Carlos); AgroDash
# se lee por su API HTTP (agrodash_api.py), no por Postgres.
FUENTES: dict[str, callable] = {
    "supabase": config.database_url,
}
_pools: dict[str, ConnectionPool] = {}


def _solo_lectura(conn) -> None:
    """Fija la transaccion en SOLO LECTURA una vez, al crear la conexion."""
    conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")


def _get_pool(fuente: str = "supabase") -> ConnectionPool:
    url_de = FUENTES.get(fuente)
    if url_de is None:
        raise ValueError(f"fuente desconocida: {fuente!r} (validas: {', '.join(FUENTES)})")
    pool = _pools.get(fuente)
    if pool is None:
        pool = _pools[fuente] = ConnectionPool(
            url_de(),
            min_size=1, max_size=6, timeout=15,
            kwargs={"autocommit": True, "connect_timeout": 10},
            configure=_solo_lectura,
            check=ConnectionPool.check_connection,  # valida (SELECT 1) antes de prestar
            name=f"analizador-ro-{fuente}",
        )
    return pool


def _limpiar(v):
    """Valor JSON-serializable: Decimal->float, datetime/date->ISO, resto igual."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def query(sql: str, params: tuple = (), fuente: str = "supabase") -> list[dict]:
    """Ejecuta una consulta de SOLO LECTURA y devuelve filas como lista de dicts.

    Toma una conexion prestada del pool de `fuente` (se devuelve sola al salir del `with`)."""
    with _get_pool(fuente).connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [d.name for d in cur.description]
            return [{c: _limpiar(v) for c, v in zip(cols, row)} for row in cur.fetchall()]


def uno(sql: str, params: tuple = (), fuente: str = "supabase") -> dict:
    """Como query() pero para consultas de UNA fila (agregados). {} si vacio."""
    filas = query(sql, params, fuente)
    return filas[0] if filas else {}


def iterar(sql: str, params: tuple = (), lote: int = 5000, fuente: str = "supabase"):
    """Itera una consulta GRANDE por lotes con un cursor de servidor (sin cargar todo).

    Para exportaciones: cientos de miles de filas no caben comodas en memoria ni
    conviene mandarlas de golpe. Devuelve un generador de tuplas CRUDAS (sin
    `_limpiar`: quien exporta decide como serializar cada tipo). La conexion
    queda prestada del pool mientras el generador vive; se devuelve al agotarlo
    o cerrarlo. El cursor con nombre exige una transaccion (la conexion esta en
    autocommit), por eso se abre una explicita; sigue siendo de SOLO LECTURA."""
    with _get_pool(fuente).connection() as conn:
        with conn.transaction():
            with conn.cursor(name=f"exportar_{uuid4().hex}") as cur:
                cur.itersize = lote
                cur.execute(sql, params)
                columnas = [d.name for d in cur.description]
                yield columnas
                for fila in cur:
                    yield fila

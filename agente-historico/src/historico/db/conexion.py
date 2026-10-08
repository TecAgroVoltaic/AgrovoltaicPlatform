"""Los dos pools de conexiones: SOLO LECTURA para las tools, escritura para el barrido.

Usa un POOL de conexiones (psycopg_pool): abrir una conexion al pooler de Supabase
cuesta ~700 ms (TLS + auth + latencia a us-east-1), mucho mas que la consulta en si
(~100-200 ms). Reusar conexiones evita pagar ese costo en cada request -> la UI deja
de esperar segundos por panel. El pool es thread-safe (FastAPI corre los `def` en su
threadpool), fija el modo SOLO LECTURA una vez por conexion (configure) y valida la
conexion antes de prestarla (check) por si el pooler cerro una inactiva.
"""
from __future__ import annotations

import os

from psycopg_pool import ConnectionPool

from historico import config

# Pools perezosos (se abren en la 1.ª consulta, no al importar -> no exigen DB en tests).
_pool: ConnectionPool | None = None        # solo lectura: herramientas
_pool_rw: ConnectionPool | None = None     # escritura: solo el barrido

# Cuantas conexiones de lectura como maximo. Era 6, y con `en_paralelo` eso se
# quedaba corto: el endpoint mas ancho (`analitica/comparativa`) dispara 6 consultas
# a la vez, asi que DOS peticiones simultaneas agotaban el pool y la segunda hacia
# cola en vez de correr. 12 deja pasar dos peticiones anchas a la vez con margen, y
# sigue MUY por debajo del techo del pooler en modo sesion.
#
# El tope real no es este numero sino `ANCHO_PARALELO`: el pool solo tiene que ser
# lo bastante grande para no ser el cuello. Subirlo sin medir no acelera nada.
TAMANO_POOL = int(os.environ.get("HISTORICO_POOL_MAX", "12"))

TAMANO_POOL_ESCRITURA = 2
ESPERA_CONEXION_SEG = 15


def _solo_lectura(conn) -> None:
    """Fija la transaccion en SOLO LECTURA una vez, al crear la conexion."""
    conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            config.database_url(),
            min_size=1, max_size=TAMANO_POOL, timeout=ESPERA_CONEXION_SEG,
            kwargs={"autocommit": True},
            configure=_solo_lectura,
            check=ConnectionPool.check_connection,  # valida (SELECT 1) antes de prestar
            name="historico-ro",
        )
    return _pool


def _get_pool_rw() -> ConnectionPool:
    """El pool con escritura. Ninguna tool del LLM llega a este pool."""
    global _pool_rw
    if _pool_rw is None:
        _pool_rw = ConnectionPool(
            config.database_url(),
            min_size=1, max_size=TAMANO_POOL_ESCRITURA, timeout=ESPERA_CONEXION_SEG,
            kwargs={"autocommit": True},
            check=ConnectionPool.check_connection,
            name="historico-rw",
        )
    return _pool_rw


def cerrar_pools() -> None:
    """Cierra los dos pools, si estaban abiertos. Se vuelven a abrir a pedido."""
    global _pool, _pool_rw
    for pool in (_pool, _pool_rw):
        if pool is not None:
            pool.close()
    _pool = _pool_rw = None

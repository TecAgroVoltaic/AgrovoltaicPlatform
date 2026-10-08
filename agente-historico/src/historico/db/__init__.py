"""Acceso a la DB — responsabilidad unica: consultar, y escribir hallazgos y alertas.

DOS POOLS, y la separacion es una garantia, no una optimizacion:

  * `query()`/`uno()` van por un pool de **SOLO LECTURA**. Es el que usan las
    herramientas, o sea todo lo que el LLM puede disparar. Una tool no puede
    escribir en la base porque su conexion no se lo permite, no porque el prompt
    se lo pida. Misma idea que restringir el juego de herramientas.
  * `ejecutar()`/`ejecutar_muchos()` van por un pool con escritura. Los usa el
    barrido por lotes (`historico.calidad.barrido`), que corre por cron y jamas
    desde una pregunta. `transaccion()` va por el mismo pool y la usan las alertas
    (`historico.alertas.store`): el generador y las acciones de la consola. Ninguna
    tool del LLM llega a este pool.

Los pools (psycopg_pool, perezosos y thread-safe) viven en `historico.db.conexion`;
la escritura en `escritura`, `en_paralelo` en `paralelo` y `en_streaming` en
`streaming`. Este paquete los reexporta: se sigue usando `from historico import db`.

Todas las tools pasan por `query()`/`uno()`, con parametros (%s) -> sin inyeccion.
Devuelve filas ya JSON-serializables (Decimal->float, fecha->ISO).

## LO QUE MANDA ACA ES LA LATENCIA, NO EL SQL

Medido el 2026-09-01 contra el pooler de Supabase en us-east-1: **un `SELECT 1`
tarda 225 ms**. O sea que el piso de CUALQUIER consulta, por trivial que sea, es
un cuarto de segundo de ida y vuelta, y el tiempo de un endpoint es basicamente
`viajes x 225 ms`. Cuatro consultas en fila son 900 ms garantizados antes de
calcular nada, y afinar el SQL de cada una no mueve la aguja.

De ahi salen las dos herramientas de abajo, y por eso no son adorno:

  * `en_paralelo()` corre las consultas INDEPENDIENTES de un mismo endpoint a la
    vez: cuatro viajes secuenciales pasan a costar UN viaje de reloj.
  * fusionar en un solo SQL las que no se pueden separar (ver el CTE unico de
    `calidad.contexto.confianza`, que eran tres viajes).

Si alguien "simplifica" esto volviendo a la version secuencial, el numero no
cambia y la consola vuelve a tardar segundos por panel.
"""
from __future__ import annotations

from historico.db import conexion, paralelo
from historico.db.conexion import TAMANO_POOL, _get_pool, _get_pool_rw, _solo_lectura  # noqa: F401
from historico.db.escritura import (  # noqa: F401
    Transaccion, ejecutar, ejecutar_muchos, transaccion,
)
from historico.db.filas import _filas, _limpiar
from historico.db.paralelo import ANCHO_PARALELO, T, _get_ejecutor, _marcado, en_paralelo  # noqa: F401
from historico.db.streaming import en_streaming  # noqa: F401


# `query` y `uno` viven en el paquete y no en un submodulo a proposito: `uno` busca
# `query` en ESTE espacio de nombres, asi que `monkeypatch.setattr(db, "query", ...)`
# sigue alcanzando tambien a `uno`, como cuando todo era un solo archivo.
def query(sql: str, params: tuple = ()) -> list[dict]:
    """Ejecuta una consulta de SOLO LECTURA y devuelve filas como lista de dicts.

    Toma una conexion prestada del pool (se devuelve sola al salir del `with`)."""
    with conexion._get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return _filas(cur)


def uno(sql: str, params: tuple = ()) -> dict:
    """Como query() pero para consultas de UNA fila (agregados). {} si vacio."""
    filas = query(sql, params)
    return filas[0] if filas else {}


def cerrar() -> None:
    """Cierra los pools y el ejecutor. Para el CLI, que si tiene un final."""
    conexion.cerrar_pools()
    paralelo.cerrar_ejecutor()

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

import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from decimal import Decimal
from typing import Callable, Iterator, TypeVar

from psycopg_pool import ConnectionPool

from historico import cache, config

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

# Cuantas consultas en vuelo puede haber a la vez en TODO el proceso por la via
# paralela. Es un freno deliberado: sin el, N peticiones simultaneas x 6 consultas
# cada una piden mas conexiones que las que hay y el pool las encola igual, solo que
# despues de haber pagado el cambio de contexto. Con el freno la cola se hace ANTES,
# que es mas barato, y ningun endpoint puede monopolizar el pool.
ANCHO_PARALELO = int(os.environ.get("HISTORICO_PARALELO_MAX", "8"))

_ejecutor: ThreadPoolExecutor | None = None
_candado_ejecutor = threading.Lock()

# Marca de "este hilo YA es un obrero del ejecutor". Sin ella, un `en_paralelo`
# anidado puede colgar el proceso entero: ver la nota de `en_paralelo`.
_anidado = threading.local()

T = TypeVar("T")


def _solo_lectura(conn) -> None:
    """Fija la transaccion en SOLO LECTURA una vez, al crear la conexion."""
    conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            config.database_url(),
            min_size=1, max_size=TAMANO_POOL, timeout=15,
            kwargs={"autocommit": True},
            configure=_solo_lectura,
            check=ConnectionPool.check_connection,  # valida (SELECT 1) antes de prestar
            name="historico-ro",
        )
    return _pool


def _get_ejecutor() -> ThreadPoolExecutor:
    """El pool de HILOS de `en_paralelo`. Perezoso y unico, como el de conexiones.

    Uno solo para todo el proceso: crear un ThreadPoolExecutor por peticion costaria
    el arranque de N hilos en el camino critico, y ademas dejaria sin techo la
    cantidad total de consultas en vuelo (ver ANCHO_PARALELO).
    """
    global _ejecutor
    with _candado_ejecutor:
        if _ejecutor is None:
            _ejecutor = ThreadPoolExecutor(max_workers=ANCHO_PARALELO,
                                           thread_name_prefix="historico-db")
        return _ejecutor


def en_paralelo(*tareas: Callable[[], T]) -> list[T]:
    """Corre consultas INDEPENDIENTES a la vez y devuelve sus resultados EN ORDEN.

    Existe por lo que dice la cabecera del modulo: contra el pooler cada viaje
    cuesta 225 ms pase lo que pase, asi que cuatro consultas secuenciales son cuatro
    cuartos de segundo y las mismas cuatro en paralelo son uno. El pool ya es
    thread-safe y FastAPI corre los `def` en su threadpool, asi que no hay nada que
    coordinar mas alla de esto.

    Reglas que la hacen intercambiable por la version secuencial, y que hay que
    respetar si alguien la toca:

      * el ORDEN de la salida es el de la entrada, nunca el de terminacion;
      * si varias tareas fallan, se levanta la excepcion de la PRIMERA en orden de
        argumento, que es exactamente la que habria salido corriendolas en fila;
      * con una sola tarea no se cruza a otro hilo (no tiene sentido pagar el salto).

    Solo para tareas INDEPENDIENTES. Si una necesita el resultado de otra, van en
    dos tandas: `a, b = en_paralelo(t1, t2)` y despues la que depende de `a`.

    ## Por que un `en_paralelo` DENTRO de otro corre en fila

    El ejecutor tiene un numero FIJO de obreros (`ANCHO_PARALELO`). Si un obrero
    encolara tareas nuevas y se quedara esperandolas, bastarian `ANCHO_PARALELO`
    tareas anidadas a la vez para que todos los obreros estuvieran esperando a
    tareas que nadie puede empezar: el proceso entero se cuelga y no hay error, se
    queda quieto. No es hipotetico, `calidad/resumen` paraleliza cuatro bloques y
    uno de ellos (`calidad_periodo.run`) paraleliza dos por su cuenta.

    Asi que un hilo que YA es obrero corre sus tareas en fila. Se pierde el
    paralelismo del nivel de adentro, que es el barato: el de afuera ya reparte.
    """
    if not tareas:
        return []
    if len(tareas) == 1 or getattr(_anidado, "dentro", False):
        return [t() for t in tareas]
    futuros = [_get_ejecutor().submit(_marcado, t) for t in tareas]
    # `result()` en orden de argumento: la primera que falle es la que se levanta, y
    # antes se espera a TODAS para que ninguna quede corriendo sobre un pool que el
    # llamador cree libre.
    for f in futuros:
        f.exception()
    return [f.result() for f in futuros]


def _marcado(tarea: Callable[[], T]) -> T:
    """Corre la tarea dejando dicho que este hilo es obrero (ver `en_paralelo`)."""
    _anidado.dentro = True
    try:
        return tarea()
    finally:
        _anidado.dentro = False


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


def en_streaming(sql: str, params: tuple = ()) -> Iterator[tuple]:
    """Filas de a UNA, sin traer el resultado entero a memoria. Para EXPORTAR.

    `query()` hace `fetchall()`, y para lo que consumen las vistas (agregados de
    unos cientos de filas) es lo correcto. Para bajarse una relacion completa no:
    la radiacion son 103.678 filas y el archivo se puede empezar a escribir con la
    primera, sin esperar a la ultima ni tener las 103.678 en el proceso a la vez.

    ## Por que `stream()` y NO un cursor de servidor, que es lo que uno buscaria

    Medido el 2026-09-04 sobre `v_sc_radiacion_calibrada` entera (103.678 filas)
    contra el pooler de Supabase:

        cur.stream()                   2,83 s    pico   0,0 MB
        query() / fetchall             4,11 s    pico  93,2 MB
        cursor de servidor con nombre  9,02 s    pico   4,8 MB

    El cursor con nombre pierde por lo mismo que gobierna todo este modulo: cada
    `FETCH` es un viaje de ~225 ms, y veintiun lotes de 5.000 filas son cinco
    segundos de puro ida y vuelta. `stream()` usa el modo de fila unica de libpq:
    un solo viaje, y las filas se van consumiendo del socket. Ademas no necesita
    transaccion, que en este pool (autocommit) es la diferencia entre funcionar y
    no: un `DECLARE CURSOR` fuera de un bloque transaccional es un error de SQL.

    Devuelve TUPLAS, no dicts, y sin pasar por `_limpiar`: quien exporta formatea
    cada tipo a su manera (datenum, ISO, NaN) y un dict por fila serian 60 MB de
    claves repetidas.

    La conexion queda prestada mientras se recorra el generador, y vuelve al pool
    al agotarlo o al cerrarlo. Cortar antes de tiempo es seguro: esta verificado
    que la conexion vuelve sana y se puede reusar enseguida.
    """
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            yield from cur.stream(sql, params)


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
    with _get_pool_rw().connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, filas)
    cache.invalidar_todo()
    return len(filas)


def cerrar() -> None:
    """Cierra los pools y el ejecutor. Para el CLI, que si tiene un final."""
    global _pool, _pool_rw, _ejecutor
    for nombre in ("_pool", "_pool_rw"):
        p = globals()[nombre]
        if p is not None:
            p.close()
            globals()[nombre] = None
    with _candado_ejecutor:
        if _ejecutor is not None:
            _ejecutor.shutdown(wait=True)
            _ejecutor = None

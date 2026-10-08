"""`en_paralelo`: las consultas INDEPENDIENTES de un endpoint, a la vez y en orden.

Existe por la cabecera de `historico.db`: contra el pooler cada viaje cuesta
~225 ms pase lo que pase, asi que la latencia manda mas que el SQL.
"""
from __future__ import annotations

import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, TypeVar

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


def cerrar_ejecutor() -> None:
    """Apaga el ejecutor esperando a sus tareas. Se vuelve a crear a pedido."""
    global _ejecutor
    with _candado_ejecutor:
        if _ejecutor is not None:
            _ejecutor.shutdown(wait=True)
            _ejecutor = None

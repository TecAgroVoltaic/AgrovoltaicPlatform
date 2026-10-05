"""El cache breve y la concurrencia: las dos piezas que bajaron los viajes a la base.

Aca no se prueba ningun numero del historico, se prueba la MAQUINARIA que hace que
esos numeros lleguen antes. Y se prueba porque las dos formas en que puede fallar
son silenciosas:

  * un cache que devuelve el objeto guardado en vez de una copia hace que la
    respuesta dependa de quien pregunto antes (los llamadores le agregan claves);
  * un `en_paralelo` que devuelve los resultados en orden de TERMINACION en vez de
    en orden de argumento mete cada consulta en la variable del vecino, y eso no
    revienta: da otros numeros.

Estructura Given-When-Then.
"""
from __future__ import annotations

import threading
import time

import pytest

from historico import cache, db


def _contador():
    """Un `calcular` que lleva la cuenta de cuantas veces lo llamaron de verdad."""
    estado = {"n": 0}

    def calcular():
        estado["n"] += 1
        return {"valor": estado["n"], "lista": [1, 2, 3]}
    return estado, calcular


# ══════════════════════════════════════════════════════════════════════════
# Lo que NO puede pasar: que el cache cambie una respuesta
# ══════════════════════════════════════════════════════════════════════════
def test_lo_que_sale_es_una_copia_y_mutarla_no_ensucia_al_siguiente():
    # Given una entrada ya guardada
    c = cache.CacheBreve(ttl_seg=60, maximo=8)
    estado, calcular = _contador()
    primero = c.obtener("k", calcular)

    # When el primer llamador le agrega cosas encima, como hacen los de verdad
    # (`vigilancia`, `sin_vigilancia`, una `advertencia` propia)
    primero["vigilancia"] = "mia"
    primero["lista"].append(99)

    # Then el segundo recibe el bloque limpio. Sin la copia PROFUNDA, la lista
    # anidada se compartiria y la respuesta dependeria de quien pregunto antes.
    segundo = c.obtener("k", calcular)
    assert "vigilancia" not in segundo
    assert segundo["lista"] == [1, 2, 3]
    assert estado["n"] == 1, "no deberia haber recalculado"


def test_claves_distintas_no_se_pisan():
    # Given dos claves que solo se diferencian en la lista de variables
    c = cache.CacheBreve(ttl_seg=60, maximo=8)
    estado, calcular = _contador()

    # When se piden las dos
    a = c.obtener(("2026-01-01", "2026-02-01", ("pv1",), None), calcular)
    b = c.obtener(("2026-01-01", "2026-02-01", ("pv2",), None), calcular)

    # Then cada una se calculo por su cuenta
    assert estado["n"] == 2 and a != b


# ══════════════════════════════════════════════════════════════════════════
# La ganancia: coalescencia (el caso real de la consola)
# ══════════════════════════════════════════════════════════════════════════
def test_varios_hilos_a_la_vez_sobre_la_misma_clave_consultan_UNA_sola_vez():
    # Given un calculo lento pedido por cinco hilos a la vez, que es exactamente lo
    # que hace la consola: `Promise.all` de cinco endpoints del mismo rango
    c = cache.CacheBreve(ttl_seg=60, maximo=8)
    llamadas = {"n": 0}
    arrancar = threading.Event()

    def calcular():
        llamadas["n"] += 1
        time.sleep(0.05)
        return {"dias_utilizables": 7}

    salidas: list = []

    def pedir():
        arrancar.wait()
        salidas.append(c.obtener("misma", calcular))

    hilos = [threading.Thread(target=pedir) for _ in range(5)]
    for hilo in hilos:
        hilo.start()

    # When largan todos juntos
    arrancar.set()
    for hilo in hilos:
        hilo.join()

    # Then la base se toco UNA vez y los cinco tienen la misma respuesta. Con un
    # cache de solo TTL los cinco habrian fallado el cache a la vez.
    assert llamadas["n"] == 1
    assert salidas == [{"dias_utilizables": 7}] * 5


def test_el_que_espera_recibe_su_propia_copia():
    # Given dos hilos sobre la misma clave, uno calculando y otro esperando
    c = cache.CacheBreve(ttl_seg=60, maximo=8)
    _, calcular = _contador()
    salidas: list = []
    hilos = [threading.Thread(target=lambda: salidas.append(c.obtener("k", calcular)))
             for _ in range(2)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join()

    # When uno de los dos muta lo suyo
    salidas[0]["mutado"] = True

    # Then el otro no se entera: el que coalesce tambien recibe copia
    assert "mutado" not in salidas[1]


# ══════════════════════════════════════════════════════════════════════════
# Los limites: TTL, tamaño, apagado y fallos
# ══════════════════════════════════════════════════════════════════════════
def test_al_vencer_el_ttl_se_vuelve_a_consultar():
    # Given un TTL practicamente nulo
    c = cache.CacheBreve(ttl_seg=0.01, maximo=8)
    estado, calcular = _contador()
    c.obtener("k", calcular)

    # When pasa mas que el TTL
    time.sleep(0.05)
    c.obtener("k", calcular)

    # Then se recalculo. Es la unica garantia que hay contra un barrido que corre en
    # OTRO proceso: la ventana de dato viejo no puede pasar del TTL.
    assert estado["n"] == 2


def test_el_cache_no_crece_sin_limite():
    # Given un techo de tres entradas y un cliente que barre rangos
    c = cache.CacheBreve(ttl_seg=60, maximo=3)
    _, calcular = _contador()

    # When se piden diez claves distintas
    for i in range(10):
        c.obtener(i, calcular)

    # Then el cache se queda en el techo: un cache sin limite es una fuga de memoria
    assert len(c._entradas) <= 3


def test_con_ttl_cero_el_cache_esta_apagado():
    # Given el cache desactivado por entorno (TTL 0)
    c = cache.CacheBreve(ttl_seg=0, maximo=8)
    estado, calcular = _contador()

    # When se pide dos veces la misma clave
    c.obtener("k", calcular)
    c.obtener("k", calcular)

    # Then siempre se consulta: apagarlo tiene que apagarlo de verdad
    assert not c.activo and estado["n"] == 2


def test_un_fallo_no_se_guarda_ni_deja_a_nadie_colgado():
    # Given un calculo que falla la primera vez
    c = cache.CacheBreve(ttl_seg=60, maximo=8)
    intentos = {"n": 0}

    def calcular():
        intentos["n"] += 1
        if intentos["n"] == 1:
            raise RuntimeError("la conexion se cayo")
        return {"ok": True}

    # When el primero revienta
    with pytest.raises(RuntimeError):
        c.obtener("k", calcular)

    # Then el siguiente lo vuelve a intentar de verdad: cachear un fallo dejaria el
    # endpoint roto durante todo el TTL por una conexion que el pooler cerro
    assert c.obtener("k", calcular) == {"ok": True}


def test_invalidar_todo_vacia_los_caches_registrados():
    # Given un cache registrado con una entrada viva
    c = cache.registrar(cache.CacheBreve(ttl_seg=60, maximo=8))
    estado, calcular = _contador()
    c.obtener("k", calcular)

    # When se escribe en la base (es lo que hace `db.ejecutar*` con el barrido)
    cache.invalidar_todo()

    # Then la siguiente lectura ve el store nuevo, sin esperar al TTL
    c.obtener("k", calcular)
    assert estado["n"] == 2
    cache._REGISTRADOS.remove(c)


# ══════════════════════════════════════════════════════════════════════════
# `en_paralelo`: tiene que ser INTERCAMBIABLE por correr las tareas en fila
# ══════════════════════════════════════════════════════════════════════════
def test_los_resultados_vuelven_en_orden_de_argumento_no_de_terminacion():
    # Given tres tareas donde la PRIMERA es la mas lenta
    def lenta():
        time.sleep(0.05)
        return "primera"

    # When se corren juntas
    salida = db.en_paralelo(lenta, lambda: "segunda", lambda: "tercera")

    # Then el orden es el de los argumentos. Si fuera el de terminacion, cada
    # consulta caeria en la variable de otra y el endpoint daria otros numeros sin
    # levantar ni un error.
    assert salida == ["primera", "segunda", "tercera"]


def test_se_levanta_la_excepcion_de_la_PRIMERA_tarea_que_falla():
    # Given dos tareas que fallan, la segunda mas rapido que la primera
    def falla_lento():
        time.sleep(0.05)
        raise ValueError("la de mas a la izquierda")

    def falla_rapido():
        raise KeyError("la de la derecha")

    # When se corren juntas
    with pytest.raises(ValueError, match="la de mas a la izquierda"):
        db.en_paralelo(falla_lento, falla_rapido)

    # Then sale la de la izquierda: es exactamente la que habria salido en fila,
    # porque la segunda ni se habria llegado a ejecutar.


def test_con_una_sola_tarea_no_se_cambia_de_hilo():
    # Given una unica tarea, que es el caso de una variable sola en `series`
    actual = threading.current_thread().name

    # When se corre por `en_paralelo`
    [donde] = db.en_paralelo(lambda: threading.current_thread().name)

    # Then corrio en el mismo hilo: pagar un salto para una sola consulta es puro
    # costo. Y ademas conserva el traceback del llamador si revienta.
    assert donde == actual


def test_sin_tareas_no_hace_nada():
    # Given ninguna tarea (una lista de variables vacia)
    # When / Then no revienta ni inventa resultados
    assert db.en_paralelo() == []


def test_un_en_paralelo_dentro_de_otro_no_cuelga_el_proceso():
    # Given tantas tareas anidadas como obreros tiene el ejecutor: es el caso de
    # `calidad/resumen`, que paraleliza cuatro bloques y uno de ellos
    # (`calidad_periodo.run`) paraleliza dos por su cuenta.
    def interior():
        return db.en_paralelo(lambda: "a", lambda: "b")

    tareas = [interior] * (db.ANCHO_PARALELO + 2)

    # When se corren todas a la vez
    salida = db.en_paralelo(*tareas)

    # Then termina. Si el nivel de adentro encolara en el mismo ejecutor y se
    # quedara esperando, TODOS los obreros esperarian a tareas que nadie puede
    # empezar y el proceso se quedaria quieto, sin error y sin respuesta.
    assert salida == [["a", "b"]] * len(tareas)

"""Un cache de vida MUY corta, con coalescencia. Para bloques que se repiten.

## Por que existe

El bloque `confianza` (ver `historico.calidad.contexto`) viaja DENTRO de casi toda
respuesta agregada, por diseño: el numero y su fiabilidad no se pueden separar. El
precio de esa garantia es que una sola pantalla de la consola lo paga varias veces
con los MISMOS argumentos: la vista de Estadistica pide cinco endpoints a la vez y
los cinco calculan la misma confianza del mismo rango.

Contra el pooler de Supabase eso son cientos de milisegundos repetidos sin que
cambie ni un numero.

## Las dos mitades, y la segunda es la que importa

  * **TTL**: una entrada vale unos pocos segundos. Cubre al que cambia de pestaña.
  * **COALESCENCIA (single-flight)**: si dos hilos piden la misma clave a la vez, uno
    calcula y el otro ESPERA su resultado en vez de disparar la misma consulta.

La segunda es la que resuelve el caso real. La consola no pide en fila: pide con
`Promise.all`, o sea que las cinco peticiones llegan a la vez y con un cache de solo
TTL las cinco fallarian el cache a la vez y harian las cinco consultas. Con
coalescencia hacen UNA.

## Lo que se devuelve es una COPIA, y no es paranoia

Los llamadores le agregan cosas al bloque (`vigilancia`, `sin_vigilancia`, una
`advertencia` propia). Si se les entregara el objeto guardado, el segundo llamador
veria los agregados del primero y la respuesta cambiaria segun quien pregunto antes.
Un cache que cambia un numero no es una optimizacion, es un defecto.

## Que pasa si corre el barrido mientras hay entradas vivas

El barrido (`historico.calidad.barrido`) reescribe `hallazgos_calidad`, que es
justo lo que `confianza` lee. Dos casos, distintos:

  * **Mismo proceso** (el CLI: `historico barrido`, `historico todo`): `db.ejecutar`
    y `db.ejecutar_muchos` llaman a `invalidar_todo()`, asi que la primera lectura
    despues de la escritura ya ve el store nuevo. Exacto, sin ventana.
  * **Otro proceso** (lo normal: el barrido va por cron y la API es otro contenedor):
    la API no se entera. Sus entradas vivas siguen sirviendo el veredicto ANTERIOR
    hasta que vencen. La ventana de dato viejo es, como mucho, el TTL.

Por eso el TTL es de segundos y no de minutos: es la unica garantia que hay contra
un barrido de otro proceso, asi que tiene que ser corta como para que la ventana no
se pueda observar. Subirlo alarga exactamente ese agujero.

Fachada del paquete: el cache vive en `breve` y el registro de invalidacion en
`registro`.
"""
from __future__ import annotations

from historico.cache.breve import MAXIMO_ENTRADAS, TTL_SEG, CacheBreve, _Entrada  # noqa: F401
from historico.cache.registro import _REGISTRADOS, invalidar_todo, registrar  # noqa: F401

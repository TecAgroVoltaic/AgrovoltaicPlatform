"""Las CINCO familias de pruebas de calidad: cuatro sobre el dato, una sobre el equipo.

    completitud            ¿esta todo lo que tenia que estar?
    validez_fisica         ¿el numero es posible?
    consistencia_temporal  ¿las marcas de tiempo se sostienen?
    anomalias              ¿el numero es posible pero raro?
    disponibilidad         ¿la planta estaba funcionando?

Las cuatro primeras son las del documento de evaluacion y juzgan el DATO. La
quinta nace de R3 de Leo Cardinale y juzga el EQUIPO, que no es lo mismo: un dia
con el inversor caido a mediodia es un dia con dato BUENO sobre un sistema MALO, y
son 41 de 202 dias evaluables (20,3 %). Por eso su hallazgo viaja por un canal
propio en `calidad.contexto` y no hunde el veredicto de calidad.

Extiende lo que ya detecta `calidad/barrido.py` (cobertura, densidad, nulos,
fuera de rango, saturacion en 85, offset nocturno, cambio de cadencia, kt
imposible) sin duplicarlo: aca van las pruebas que el barrido no cubre, con sus
umbrales exactos y con un tipo de hallazgo propio cada una.

Tres piezas y nada mas:

  * `umbrales`  TODOS los cortes, con su origen anotado. Cero numeros sueltos en
                el resto del paquete.
  * `contrato`  la firma comun `(Serie, Contexto) -> list[Hallazgo]` y la forma
                del hallazgo, que es la de la tabla `hallazgos_calidad`.
  * `registro`  el catalogo de pruebas y `correr()`, que lo RECORRE. Agregar una
                prueba es escribir la funcion y anotarla; nadie la llama a mano.

La consulta va aparte (`consultas`): el criterio recibe la serie ya traida, es
puro y se prueba entero sin base de datos.

`ContextoDisponibilidad` se exporta al lado de `Contexto` porque es lo que tiene
que armar quien corre el catalogo entero (`calidad.barrido`, `calidad.corrida`):
es el `Contexto` comun mas la radiacion por bin de 5 minutos con que la quinta
familia gradua la severidad. Con un `Contexto` pelado la prueba no se calla, pero
saca todos sus hallazgos con motivo `sin_irradiancia`, y esa perdida no se ve
mirando la salida.
"""
from __future__ import annotations

from historico.calidad.pruebas.contrato import (
    Contexto, Hallazgo, NoAplica, Serie, VentanaSolar,
)
from historico.calidad.pruebas.disponibilidad import ContextoDisponibilidad
from historico.calidad.pruebas.registro import (
    CATALOGO_PRUEBAS, TIPOS, Corrida, Evaluacion, PruebaRegistrada, correr,
)

__all__ = [
    "CATALOGO_PRUEBAS", "TIPOS", "Contexto", "ContextoDisponibilidad", "Corrida",
    "Evaluacion", "Hallazgo", "NoAplica", "PruebaRegistrada", "Serie",
    "VentanaSolar", "correr",
]

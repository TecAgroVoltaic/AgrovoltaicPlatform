"""Que hace material un hallazgo, que tipos invalidan un dia y cuales son del EQUIPO."""
from __future__ import annotations

# Un hallazgo es MATERIAL si toca al menos esta fraccion de las lecturas del dia.
# Un dia no deja de servir porque 3 de 144 lecturas de una de trece columnas se
# salieran de rango; sin este matiz los 274 dias daban "grave" y el veredicto no
# distinguia nada.
FRACCION_MATERIAL = 0.20
#
# CUIDADO al tocar la comparacion de materialidad: si el dia no tiene lecturas
# contadas, el denominador es cero y `n_afectadas >= 0.20 * 0` se cumple SIEMPRE,
# asi que cualquier hallazgo invalidaria el dia. Por eso las dos implementaciones
# (el SQL y `reducir`) exigen denominador positivo antes de comparar.
#
# No es hipotetico: las pruebas de `calidad.pruebas` escriben hallazgos con fuente
# `radiacion_sc_clearsky`, `radiacion_sc_poa` y `sin_fuente`, y ninguna de las tres
# aparece en el CTE `filas_dia`. Sin la guarda, estrenar esas pruebas habria puesto
# en rojo dias sanos.
#
# Cuando no se puede medir la fraccion, el hallazgo cuenta como NO material. Los
# que de verdad matan un dia ya estan en TIPOS_QUE_INVALIDAN, que no mira el
# denominador; lo unico que se pierde asi es rigor sobre una fuente que no sabemos
# medir, mientras que el error opuesto condena dias sanos sin ninguna evidencia.
#
# Estos invalidan el dia por su naturaleza, sin importar cuantas lecturas toquen.
# `timestamp_duplicado` es el mismo hecho que `duplicado_timestamp` visto por la
# familia de consistencia temporal (`calidad.pruebas`): un dia con marcas
# repetidas no sirve para cruzar irradiancia contra generacion, que es justo para
# lo que existe el veredicto. Van los dos nombres porque los escriben dos
# detectores distintos y ninguno de los dos puede quedar fuera.
#
# `parametro_faltante` NO esta y es deliberado: que falte una columna no invalida
# a las otras, y ese matiz ya lo resuelve el desglose por variable de `reducir()`.
TIPOS_QUE_INVALIDAN = ("dia_incompleto", "duplicado_timestamp", "timestamp_duplicado")

# ── Disponibilidad del EQUIPO: fuera del veredicto, pero a la vista ───────────
# Estos hallazgos NO hablan de la calidad del dato: hablan de la planta. Un dia
# con el inversor caido entre las 07:00 y las 17:00 es un dia con dato BUENO
# sobre un sistema MALO, y son 41 de 202 dias evaluables (20,3 %).
#
# Meterlos en el veredicto seria un error en la direccion PELIGROSA. `confianza()`
# es lo que toda herramienta incrusta para decir "de este periodo se puede fiar":
# con los apagones dentro, un mes con la planta parada la mitad de los dias sale
# con la confianza hundida y el agente concluye "no confies en la energia de este
# mes", cuando la verdad es la contraria: la energia de ese mes es EXACTA, y es
# baja porque la planta estuvo parada. La advertencia de calidad esconderia la
# averia en vez de mostrarla.
#
# Por eso no basta con dejarlos fuera de TIPOS_QUE_INVALIDAN: hay que sacarlos de
# las TRES cuentas del veredicto.
#   * `materiales`, o un apagon de dia entero (n_afectadas = todas las lecturas)
#     supera el 20 % y pone el dia en grave;
#   * `graves` y `avisos`, o `_veredicto` devuelve "aviso" y ningun dia con la
#     planta parada podria salir "ok" aunque su dato sea impecable.
#
# Y en vez de silenciarlos, viajan por un CANAL PROPIO: `disponibilidad` en la
# salida de `confianza()` y las columnas `lecturas_sin_acoplar` / `parada_bajo_sol`
# en la de `dias()`. La alternativa (una severidad `info`) los habria dejado
# indistinguibles del ruido de diagnostico, y el numero que el experto necesita
# es justamente "41 de 202 dias con la planta parada", no un renglon mas al pie.
TIPOS_DE_DISPONIBILIDAD = ("inversor_sin_acoplar",)

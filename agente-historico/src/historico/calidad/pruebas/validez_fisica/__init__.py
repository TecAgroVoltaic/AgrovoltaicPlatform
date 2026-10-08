"""Familia 2: validez fisica. ¿El numero es POSIBLE?

Las nueve pruebas del documento se reducen a tres funciones genericas, y esa
reduccion es el punto: "irradiancia < 0", "RH < 0", "viento < 0" y "precipitacion
< 0" son la MISMA prueba con distinto limite, y escribirlas cuatro veces solo
garantiza que la quinta se olvide. El limite sale de
`catalogo.obtener(clave).minimo/.maximo`, que es la fuente de verdad de los
rangos y ademas la allowlist de SQL. La trazabilidad de que linea del PDF
corresponde a que entrada del catalogo esta en `umbrales.LIMITES_DEL_DOCUMENTO`.

## Cuatro de las nueve pruebas no tienen dato, y se reportan igual

RH, temperatura ambiente, viento y precipitacion no existen en ninguna tabla: el
catalogo las registra con `fuente_ausente` y su motivo. La prueba se implementa
igual y el corredor la marca `sin_fuente`. Omitirlas seria peor que no tenerlas:
un informe de validez fisica sin renglon de humedad se lee como una humedad
correcta, y nadie va a ir a buscar la prueba que falta.

## Esta familia SOLO corre contra el crudo, y se niega a fingir lo contrario

Las vistas corregidas ya convierten a NULL todo lo que cae fuera de rango. Leida
contra ellas, esta familia devuelve cero valores imposibles porque la vista los
borro, no porque el sensor estuviera bien: un aprobado falso POR CONSTRUCCION, y
del peor tipo, porque es indistinguible de un aprobado real.

Por eso las tres pruebas se declaran `no_aplica` cuando la serie viene de una
vista corregida, en vez de devolver la lista vacia. La forma correcta de correrlas
es `consultas.serie(clave, ..., crudo=True)`, que usa el `origen_crudo` que
registra el catalogo: contra el crudo si aparecen los 26.503.162 W de
`potencia_pv1_w` que dejaron las filas mezcladas del piranometro.

`kt_star` es el unico caso con fuente y sin crudo: es un cociente que la vista
calcula al vuelo. Se mide igual (la vista no le recorta el rango) pero la serie
llega con origen DERIVADA y el hallazgo lo dice, porque un numero calculado y una
lectura de sensor no son la misma evidencia.

## El 0 de las tres variables AC ya NO es una violacion de rango

R3 de Leo Cardinale: el 0 de `voltaje_vac`, `frecuencia_hz` y `potencia_total_wac`
**es dato valido**, la lectura exacta de un inversor que no se acoplo. Con el
rango 100-280 V puesto, esos ceros salian `fuera_de_rango` GRAVE en 238 dias y
declaraban malo un dato perfecto; lo que estaba mal era el equipo. Eso ahora lo
mide `disponibilidad.py`, en un eje que no toca la calidad del dato.

La exencion se escribe aca ADEMAS de en el catalogo, y a proposito: es una
decision sobre un valor concreto (el 0) y no sobre un rango, asi que sobrevive a
cualquier limite que el catalogo vuelva a fijar para esas columnas. Todo lo demas
sigue cayendo igual: un voltaje negativo, que si es fisicamente imposible, sigue
siendo `bajo_minimo_fisico`.

Fachada del paquete: `rango` (minimo y maximo) y `nocturna` (irradiancia de noche).
"""
from __future__ import annotations

from historico.calidad.pruebas.validez_fisica.nocturna import _PREFIJO_IRRADIANCIA, irradiancia_de_noche  # noqa: F401
from historico.calidad.pruebas.validez_fisica.rango import (  # noqa: F401
    _cero_declarado_valido, _exigir_dato_sin_corregir, bajo_minimo, sobre_maximo,
)

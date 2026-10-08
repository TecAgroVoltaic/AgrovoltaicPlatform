"""La cadencia de referencia POR TRAMO. Resuelve la trampa de las tres epocas.

El historico no tiene una cadencia: tiene tramos a 2 s (dic 2024), 1 min
(may 2025) y 5 min (nov 2025+), y ademas archivos sueltos a 6 s. Una prueba
temporal escrita contra un numero fijo no detecta nada, marca media base como
rota: con 300 s de referencia, diciembre 2024 entero (una muestra cada 2 s) seria
un dia de "intervalos anomalos", y con 15 s lo seria todo noviembre 2025 en
adelante.

La decision, en este orden y sin excepciones:

  1. **INFERIDA (local).** La moda de los saltos VECINOS de esa muestra, dentro de
     su mismo dia. Es la clave del modulo y esta explicada abajo.
  2. **INFERIDA (del dia).** Si la ventana local no da para una moda, la del dia
     entero. Es lo que hace `barrido.py` en SQL (`mode() WITHIN GROUP`), y se
     replica el criterio para que las dos capas no puedan discrepar.
  3. **INFERIDA_SERIE.** Si el dia no da ni para una moda (menos de dos muestras),
     la moda de la SERIE entera. Cubre el caso que antes cubria el metadato: un
     dia casi vacio sigue teniendo una referencia sensata, y sale de datos reales.
  4. **DECLARADA.** `intervalo_original_seg`, y solo cuando el dato NO alcanza para
     inferir nada (ver abajo por que no va primera).
  5. **NOMINAL.** Si nada de lo anterior aplica, la tasa nominal que fija el
     documento: 5 min lo electrico, 15 s la radiacion.

## Por que la moda es LOCAL y no del dia entero

Porque las dos cosas que hay que distinguir viven en la misma escala. Un dia que
arranca a 60 s y pasa a 300 s a media mañana no tiene un hueco: se reconfiguro el
logger, y ese hecho lo reporta `cambio_de_cadencia`. Pero un salto de 600 s dentro
de un tramo a 300 s SI es una fila perdida.

Con la moda del dia entero el tramo minoritario se juzga contra la cadencia del
mayoritario y todo el tramo sale como huecos falsos. Con una ventana corta cada
muestra se juzga contra sus vecinas: el tramo lento tiene por referencia su propia
cadencia, y el hueco suelto queda en minoria dentro de su ventana y se detecta.

Es lo que el titulo de este modulo dice desde el principio, POR TRAMO, y lo que
antes se intentaba conseguir leyendo el metadato.

## Por que `intervalo_original_seg` NO encabeza la lista

La primera version de este modulo la ponia primera, con un argumento correcto: el
metadato no se degrada cuando faltan muestras. El problema es que esa columna **no
contiene lo que el argumento supone**. Guarda la cadencia del CSV de ORIGEN, no la
del dato almacenado, y el ETL remuestrea.

Medido contra produccion el 2026-08-28 sobre `monitoreo_sc_electrico`:

  * 35.101 de 36.468 saltos consecutivos son de exactamente 300 s: la tabla esta
    remuestreada a 5 min uniformes.
  * En esos mismos pasos de 300 s, `intervalo_original_seg` promedia 241,8 s y
    baja hasta 2 s, porque describe el CSV de ORIGEN.
  * Con el umbral de 2x sobre la cadencia DECLARADA, **8.756 saltos salen como
    intervalo excesivo. Con la cadencia MEDIDA salen 65.** De la diferencia, 8.691
    son pasos normales de 300 s marcados como hueco solo porque el CSV de origen
    iba mas rapido: 2 x 62 s da 124 s, y un paso de 300 s lo supera sin ser nada.
  * En sentido contrario no se pierde nada: cero saltos que el criterio declarado
    detecte y el medido no.

O sea: priorizar el metadato reportaba como hueco uno de cada cuatro pasos de la
tabla principal. No es un ajuste de sensibilidad, es la diferencia entre una prueba
que senala 65 anomalias reales y una que ahoga esas 65 entre 8.691 falsas.

(Nota sobre el borde: un hueco de EXACTAMENTE 600 s, o sea una sola fila perdida en
un tramo de 300 s, no lo ve ninguno de los dos criterios, porque el documento pide
intervalos "mayores a dos veces" la tasa y 600 no es mayor que 600. Son 1.029 casos
y quien los detecta es `completitud.timestamps_faltantes`, que cuenta las muestras
que debieron estar en vez de mirar el tamano del salto.)

`intervalo_original_seg` sigue siendo util para OTRA cosa: saber con que cadencia
se tomo el CSV de origen, que es trazabilidad y es lo que alimenta el hallazgo
`cambio_de_cadencia` del barrido. No es la cadencia del dato guardado.

El origen viaja en el hallazgo. Que un tramo infiera 2 s no es un error, es
diciembre de 2024, y quien lea el hallazgo tiene que poder distinguirlo.

## El corte por dia no es un detalle de implementacion

El logger de San Carlos SOLO graba de dia. El salto de las 17:45 a las 05:45 del
dia siguiente son doce horas de noche, no un hueco de datos. Por eso los pasos se
calculan DENTRO de cada dia: sin ese corte, cada dia del historico empezaria con
un hueco falso de 43.000 segundos y la prueba de intervalos seria inutilizable.

Fachada del paquete: `primitivas` (pasos, moda, nominal) y `referencia` (la
cadencia esperada por muestra, la dominante y los tramos).
"""
from __future__ import annotations

from historico.calidad.pruebas.cadencia.primitivas import (  # noqa: F401
    _PRECISION_SEG, DECLARADA, INFERIDA, INFERIDA_SERIE, MUESTRAS_DE_CONTEXTO, NOMINAL,
    REPETICIONES_PARA_CREER, Esperada, Paso, moda, nominal, pasos,
)
from historico.calidad.pruebas.cadencia.referencia import (  # noqa: F401
    _MEMO, _calcular_esperada, dominante, esperada, tramos,
)

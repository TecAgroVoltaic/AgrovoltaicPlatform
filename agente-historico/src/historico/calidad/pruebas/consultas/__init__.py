"""El SQL de las pruebas. Trae la serie; NO decide nada.

La separacion es la misma de `calidad.contexto.reducir()` y por la misma razon:
el criterio es lo unico discutible con el equipo, es donde viven los defectos y
tiene que poder probarse entero sin base de datos. Aca solo se leen filas.

## La allowlist

Ningun nombre de relacion ni de columna se arma con texto de nadie: TODOS salen
de `catalogo.obtener(clave)`, que es la allowlist del proyecto, incluidos los del
crudo (`Variable.origen_crudo`). El rango va siempre por `%s`. Una clave que no
este en el catalogo revienta antes de tocar SQL.

## Corregido para analizar, crudo para validar

El catalogo registra los DOS origenes de cada variable, y la diferencia decide si
una prueba significa algo. Las vistas corregidas anulan lo que cae fuera de
rango, asi que la familia de validez fisica leida contra ellas da cero valores
imposibles porque la vista los borro, no porque el sensor estuviera bien. Por eso
`crudo=True` existe y por eso la serie viaja etiquetada con su origen: la prueba
que no puede correr sobre un dato ya corregido se declara `no_aplica` en vez de
devolver una lista vacia, que se leeria como un aprobado.

`kt_star` es el unico caso con fuente y sin crudo (es un cociente que la vista
calcula al vuelo): se sirve de la vista con origen DERIVADA, que es lo que le
permite a la evaluacion decir que no es una lectura de sensor.

## Por que la `fuente` del hallazgo es la tabla, no la vista

`calidad.contexto` cruza los hallazgos contra el conteo de filas por
(fecha, fuente) usando `radiacion_sc_15s` y `monitoreo_sc_electrico`: un hallazgo
con el nombre de la vista no cruzaria con nada y el dia se veria limpio. Por eso
la fuente sale de `relacion_cruda`, que es el nombre con que el barrido ya
etiqueta lo suyo.

## Zona horaria: se le quita la etiqueta, no se convierte

`db.query` devuelve los timestamps como texto ISO con `+00`, y ese `+00` MIENTE:
lo guardado es el reloj de pared local de Costa Rica. Aca se descarta la etiqueta
para trabajar con datetimes naive comparables entre si y contra `ventana_solar`,
que esta guardada con la misma convencion. Quitar una etiqueta falsa no es
convertir de zona: convertir correria seis horas todos los perfiles del dia.

## Por que existe `series_de` ademas de `serie`

Contra el pooler de Supabase el coste dominante es la LATENCIA del viaje, no la
consulta: el barrido necesita veintidos variables sobre el mismo rango y pedirlas
de a una son veintidos viajes para traer, en cinco de esas veces, columnas de la
misma tabla. `series_de` trae todas las columnas de una relacion en un SELECT y
reparte el resultado en N `Serie`. Es el mismo SQL con mas columnas.

## Las dos consultas que no devuelven una `Serie`

`ventanas_solares` y `radiacion_por_bin` arman el CONTEXTO, no la serie que se
juzga: la primera dice cuando amanecio cada dia (la usa la irradiancia nocturna) y
la segunda trae la radiacion promediada por ventana de 5 minutos, que es con lo
que la familia de disponibilidad gradua la severidad de un inversor caido. Sin la
segunda, esa familia corre igual pero saca TODO con motivo `sin_irradiancia`: el
hallazgo aparece y la graduacion, que es su aporte central, se pierde en silencio.

Fachada del paquete: `comun` (origen, reloj, fecha), `series` (lo que se juzga) y
`entorno` (ventanas solares y radiacion por bin).
"""
from __future__ import annotations

from historico.calidad.pruebas.consultas.comun import (  # noqa: F401
    RELACIONES_CON_INTERVALO, _columna_intervalo, _como_fecha, _origen, _sin_etiqueta,
)
from historico.calidad.pruebas.consultas.entorno import (  # noqa: F401
    CLAVE_DE_LA_RADIACION, ORIGEN_DEL_BIN, radiacion_por_bin, ventanas_solares,
)
from historico.calidad.pruebas.consultas.series import serie, series_de  # noqa: F401

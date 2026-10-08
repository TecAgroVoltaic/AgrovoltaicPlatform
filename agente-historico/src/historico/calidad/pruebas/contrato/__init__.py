"""El contrato COMUN de una prueba de calidad. Todo el paquete cuelga de aca.

    prueba(serie: Serie, contexto: Contexto) -> list[Hallazgo]

Una prueba = una funcion PURA con esa firma y un `tipo` de hallazgo propio. Nada
mas. Esa uniformidad es lo que permite que el catalogo de pruebas se RECORRA en
vez de llamarse a mano una por una, y es lo que hace que agregar una prueba sea
escribir una funcion y registrarla, sin tocar el que las corre.

## Por que la serie llega ya traida

La consulta va aparte (`consultas.py`). El criterio recibe los datos en memoria y
decide. Es el mismo patron de `calidad.contexto.reducir()`, y por la misma razon:
la decision es lo unico discutible con el equipo, es donde viven los defectos y
es lo que se puede probar entero SIN base de datos.

## Por que hay `estado` y no solo hallazgos

Una prueba que no aparece en el informe se lee como una prueba que paso. Cuatro
de las nueve pruebas de validez fisica del documento (RH, temperatura ambiente,
viento, precipitacion) no tienen fuente en ninguna tabla: si simplemente no
salieran, el informe diria que la validez fisica esta limpia. Por eso el
resultado de correr una prueba es una `Evaluacion` con estado explicito
(`evaluada`, `sin_fuente`, `sin_datos`, `no_aplica`), y los `Hallazgo` son solo
lo que ademas hay que persistir.

## Por que el hallazgo tiene esta forma exacta

`Hallazgo.como_fila()` devuelve la 7-tupla que espera el INSERT de
`calidad/barrido.py`, en su orden: (fecha, fuente, variable, tipo, severidad,
n_afectadas, detalle). La PK del store es (fecha, fuente, variable, tipo), asi
que **cada prueba tiene un `tipo` distinto**: dos pruebas que compartieran tipo
se pisarian la fila en el `ON CONFLICT` y una de las dos desapareceria en
silencio. `fuente` es el nombre de la TABLA BASE, no el de la vista corregida,
porque es con ese nombre que `contexto.reducir()` cruza hallazgos contra filas.

## Zona horaria: no se toca

Las marcas son el reloj de pared local de Costa Rica. `consultas.py` les quita la
etiqueta `+00` (que miente) y aca dentro todo es naive y comparable. Ninguna
prueba convierte zona horaria; la de irradiancia nocturna compara contra
`ventana_solar`, que esta guardada con la misma convencion.

Fachada del paquete: `constantes`, `tipos` y `utilidades`.
"""
from __future__ import annotations

from historico.calidad.pruebas.contrato.constantes import (  # noqa: F401
    AVISO, CORREGIDA, CRUDO, DERIVADA, EVALUADA, FUENTE_SIN_ORIGEN, GRAVE, INFO, NO_APLICA,
    SIN_DATOS, SIN_FUENTE, TIPO_SIN_FUENTE,
)
from historico.calidad.pruebas.contrato.tipos import (  # noqa: F401
    Contexto, Hallazgo, NoAplica, Prueba, Serie, VentanaSolar,
)
from historico.calidad.pruebas.contrato.utilidades import (  # noqa: F401
    es_nan, es_valor, hallazgos_por_dia, indices_por_dia, severidad_por_fraccion,
)

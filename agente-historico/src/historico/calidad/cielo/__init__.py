"""Punto 3: criterios estadisticos de nubes respecto a la irradiancia.

La irradiancia cruda no dice si hubo nubes: la mayor parte de su forma es la
parabola del sol, que depende de la hora y del dia del año, no del cielo. Para
hablar de nubes hay que quitar esa parabola, y eso es el **indice de cielo
despejado**:

    kt = irradiancia medida / irradiancia teorica con cielo despejado

Con kt, "0,9 a mediodia" y "0,9 a las 7 de la mañana" significan lo mismo: cielo
despejado. El clear-sky ya esta materializado en `radiacion_sc_clearsky` (Ineichen
con turbidez de Linke, pvlib), asi que aca es una division.

Pero kt solo dice CUANTA luz llego, no COMO llego. Un dia con kt medio 0,5 puede
ser una capa uniforme de nubes toda la mañana o un sol entrando y saliendo cada dos
minutos, y para un sistema fotovoltaico no son lo mismo ni de lejos. Eso lo separa
el **indice de variabilidad** (VI, de Stein/Hansen/Riley): el largo de arco de la
curva medida dividido por el de la curva de cielo despejado. Un dia perfectamente
despejado da VI ~ 1; el paso de nubes lo dispara.

kt y VI juntos dan la clasificacion del dia:

    kt alto  + VI bajo  -> despejado
    kt bajo  + VI bajo  -> cubierto (capa uniforme)
    VI alto             -> variable (intermitente, el peor caso para el inversor)
    resto               -> parcial

Y hay un tercer uso, que es el que engancha con el punto 1: **kt > 1,2 es
fisicamente imposible**, mas energia que la que manda el sol con cielo despejado.
Eso no es una nube, es un dato malo o una calibracion mal puesta. O sea que el
criterio de nubes es tambien un detector de datos invalidos, y del mejor tipo,
porque no depende de un umbral inventado sino de la fisica.

OJO: se lee `v_sc_radiacion_calibrada`, que anula todo lo anterior al 2025-07-01
(el error de irradiancia que el equipo corrigio a mediados de 2025, ver
docs/memoria/decisiones/respuestas-leo-cardinale.md). Antes de esa fecha no hay
caracterizacion de cielo, y es correcto que no la haya.

Fachada del paquete: el SQL vive en `consultas` y la clasificacion y la corrida en
`caracterizacion`.
"""
from __future__ import annotations

from historico.calidad.cielo.caracterizacion import caracterizar, clasificar  # noqa: F401
from historico.calidad.cielo.consultas import _SQL_CIELO, _UPSERT_CIELO, _UPSERT_HALLAZGO  # noqa: F401

"""Constantes del comparativo: potencia instalada, integral a 5 min y criterio estacional."""
from __future__ import annotations

from historico.analitica import rendimiento

# La potencia instalada por arreglo sale de `rendimiento`, que es donde vive el PR:
# dos copias del mismo 1.420 Wp pueden separarse, y una sola no.
P0_WP = rendimiento.P0_WP
HORAS_POR_LECTURA = 5.0 / 60.0    # misma integral que tools/energia.py: 1 fila = 5 min
WH_POR_KWH = 1000.0
# Un mes entra a la comparacion estacional solo si tiene datos en esta fraccion de
# sus dias. Por debajo, la diferencia entre dos meses es la cobertura, no la estacion.
COBERTURA_MENSUAL_MINIMA = 0.6
MESES_MINIMOS = 2
INCLINADO, VERTICAL = rendimiento.INCLINADO, rendimiento.VERTICAL

# De que variables depende la respuesta, en claves del CATALOGO (el catalogo las
# traduce al nombre con que el barrido las conoce). `confianza` las mira UNA POR UNA:
# sin esto una columna rota ajena (la frecuencia, el DS18B20 muerto) condena el
# periodo entero. Las dos POA van en la lista aunque el barrido NO las vigile,
# justamente para que el bloque lo diga: el PR depende de ellas y nadie las revisa.
#
# Son las MISMAS que mira `rendimiento`, y a proposito: desde que el PR de aca es el
# suyo, las dos respuestas dependen del mismo dato y tienen que declarar lo mismo.
CLAVES_POA = rendimiento.CLAVES_POA
CLAVES = list(rendimiento.CLAVES)

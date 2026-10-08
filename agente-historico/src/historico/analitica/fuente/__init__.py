"""De donde sale cada variable, sobre que rejilla se agrega y cuanto cubre su fila.

Lo comparten los tres modulos de graficos (`series`, `distribucion`, `carpeta`)
porque los tres necesitan exactamente lo mismo antes de poder consultar nada:
resolver la variable a una tabla CORREGIDA, armar la rejilla de buckets que se va
a dibujar, y traer el bloque de confianza acotado a las columnas que el grafico
usa. Tenerlo en un solo lugar no es orden: es que el que se olvide de actualizar
su copia es el que termina leyendo una tabla cruda, donde `potencia_pv1_w` llega a
26.503.162 W en un arreglo de 1.420 Wp.

## El peso temporal de una fila es el SALTO REAL, no un metadato

Para integrar (irradiacion mensual, celda de carpeta en Wh) hace falta saber cuanto
tiempo cubre cada lectura. `intervalo_original_seg` NO sirve: guarda la cadencia del
CSV original, no la de la fila guardada. Medido contra la base: en
`monitoreo_sc_electrico` 35.101 de 36.468 saltos reales son exactamente 300 s
mientras esa columna va de 2 a 330 s en esas mismas filas, y en `radiacion_sc_15s`
un salto real de 15 s convive con valores de 2 a 300 s en la columna. No hay
correspondencia fiable.

Lo que no puede mentir es el salto al siguiente registro
(`lead(timestamp) - timestamp`), y funciona igual en las dos tablas sin casos
especiales. Con un techo, que no es opcional: ver `TECHO_SALTO_SEG`.

Fachada del paquete: `lectura` (origen, filtros y salto acotado), `buckets` (rejilla
y tope) y `confianza` (el bloque acotado al grafico).
"""
from __future__ import annotations

from historico.analitica.fuente.buckets import (  # noqa: F401
    FORMATO_BUCKET, FORMATO_BUCKET_SQL, MAXIMO_PUNTOS, rejilla, validar_tamano,
)
from historico.analitica.fuente.confianza import confianza_de  # noqa: F401
from historico.analitica.fuente.lectura import (  # noqa: F401
    _FILTRO, _SALTO_ACOTADO, TECHO_SALTO_SEG, FuenteAusente, Origen, donde, lecturas_pesadas,
    origen, peso_temporal,
)
from historico.calidad import contexto  # noqa: F401 — punto de sustitucion de las pruebas

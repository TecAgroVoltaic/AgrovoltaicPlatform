"""Familia 1: completitud. ¿Esta todo lo que tenia que estar?

Las seis pruebas del documento: NaN, NULL, timestamps faltantes, minutos
faltantes, parametros faltantes y dispositivos faltantes.

NaN y NULL van SEPARADOS aunque los dos signifiquen "no hay numero", porque no se
arreglan en el mismo lado. Un NULL es una columna que no vino en el CSV de ese
dia (el problema de los trece esquemas, se arregla en el mapeo del ETL); un NaN
es una lectura que llego rota o una division que salio mal, y ademas envenena
cualquier promedio que la toque. Contarlos juntos borra esa diferencia.

Fachada del paquete: `presencia` (NaN, NULL, parametro, dispositivo) y `tiempo`
(timestamps y minutos faltantes).
"""
from __future__ import annotations

from historico.calidad.pruebas.completitud.presencia import (  # noqa: F401
    dispositivos_faltantes, parametro_faltante, valores_nan, valores_nulos,
)
from historico.calidad.pruebas.completitud.tiempo import (  # noqa: F401
    _SEGUNDOS_POR_MINUTO, minutos_faltantes, timestamps_faltantes,
)

"""Las hojas del informe, armadas desde filas YA consultadas. Todo PURO, sin DB.

Aca no se calcula ningun indicador nuevo: el PR sale de `analitica.rendimiento`,
la energia AC de `analitica.energia` y el veredicto de `calidad.contexto`. Lo que
hace este modulo es JUNTARLOS por dia, que es lo que hoy rearma a mano quien baja
los datos crudos.

Dos reglas que valen para todas las hojas:

  * Una celda sin dato va VACIA y con motivo en la columna de al lado, nunca en
    cero. Es la misma grieta que cierra `analitica.resultado`.
  * El PR de un dia que no pasa el criterio de `rendimiento.evaluar_dia` no se
    escribe: un PR sobre medio dia de radiacion es un numero plausible y falso.

  comun.py               constantes, motivos y conversiones compartidas.
  columnas_diario.py     las columnas de la hoja Diario (las reusa Disponibilidad).
  hoja_diario.py         Diario.
  hoja_mensual.py        Mensual y el renglon total.
  hoja_disponibilidad.py Disponibilidad.
  hoja_calidad.py        Calidad.
"""
from historico.informe.secciones.columnas_diario import COLUMNAS_DIARIO
from historico.informe.secciones.comun import (CONTADOR, GHI, HORAS_POR_LECTURA,
                                              INCLINADO, INTEGRAL, PARADA, POA,
                                              PR_IMPOSIBLE, SIN_CONTADOR, SIN_FILAS,
                                              VERTICAL, WH_POR_KWH, conteo)
from historico.informe.secciones.hoja_calidad import COLUMNAS_CALIDAD, calidad
from historico.informe.secciones.hoja_diario import diario, filas_diario
from historico.informe.secciones.hoja_disponibilidad import disponibilidad
from historico.informe.secciones.hoja_mensual import (COLUMNAS_MENSUAL, fila_agregada,
                                                     filas_mensual, mensual, ventaja)

__all__ = [
    "COLUMNAS_CALIDAD", "COLUMNAS_DIARIO", "COLUMNAS_MENSUAL", "CONTADOR", "GHI",
    "HORAS_POR_LECTURA", "INCLINADO", "INTEGRAL", "PARADA", "POA", "PR_IMPOSIBLE",
    "SIN_CONTADOR", "SIN_FILAS", "VERTICAL", "WH_POR_KWH", "calidad", "conteo",
    "diario", "disponibilidad", "fila_agregada", "filas_diario", "filas_mensual",
    "mensual", "ventaja",
]

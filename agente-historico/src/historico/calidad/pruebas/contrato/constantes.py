"""Severidades, estados de evaluacion y origenes del dato de una serie."""
from __future__ import annotations

GRAVE, AVISO, INFO = "grave", "aviso", "info"

EVALUADA, SIN_FUENTE, SIN_DATOS, NO_APLICA = (
    "evaluada", "sin_fuente", "sin_datos", "no_aplica")

# `hallazgos_calidad.fuente` es NOT NULL y una variable sin origen no tiene
# relacion: este literal ocupa la casilla y deja el hueco consultable con SQL.
FUENTE_SIN_ORIGEN = "sin_fuente"
TIPO_SIN_FUENTE = "sin_fuente"

# De donde salio el dato de la serie. NO es metadato decorativo: decide si una
# prueba de validez fisica significa algo o miente por construccion.
#
#   CRUDO      la tabla sin corregir, tal como la escribio el ETL.
#   CORREGIDA  una vista que YA anula lo que cae fuera de rango. La validez fisica
#              leida de aca da cero valores imposibles porque la vista los borro,
#              no porque el sensor estuviera bien.
#   DERIVADA   la vista la calcula al vuelo y no existe cruda en ninguna tabla
#              (hoy solo `kt_star`, que es un cociente). Se puede medir, pero es un
#              numero calculado y no una lectura, y eso hay que decirlo.
CRUDO, CORREGIDA, DERIVADA = "crudo", "corregida", "derivada"

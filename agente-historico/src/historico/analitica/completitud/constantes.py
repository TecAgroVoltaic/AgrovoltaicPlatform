"""Constantes de la completitud: fuentes, cadencias nominales, campos y la nota."""
from __future__ import annotations

ELECTRICO, RADIACION = "electrico", "radiacion"
FUENTES = (ELECTRICO, RADIACION)

# Cadencia OBJETIVO de cada fuente segun el documento. Es el ultimo recurso: solo
# se usa cuando el periodo no tiene ni una fila con `intervalo_original_seg`.
CADENCIA_NOMINAL_SEG = {ELECTRICO: 300, RADIACION: 15}

# De donde salio la cadencia contra la que se midio el periodo.
MEDIDA, NOMINAL = "medida", "nominal"

_CAMPO_FILAS = {ELECTRICO: "filas_electrico", RADIACION: "filas_radiacion"}
_CAMPO_CADENCIA = {ELECTRICO: "cadencia_electrico", RADIACION: "cadencia_radiacion"}
_SEGUNDOS_POR_HORA = 3600

# La completitud cuenta FILAS, no valores de una columna, asi que ninguna columna
# rota la invalida: el bloque de confianza queda como cobertura de dias del periodo.
COLUMNAS: list[str] = []

_NOTA = (
    "los dias sin una sola fila salen del calendario solar, no de las tablas de "
    "datos. Lo esperado se mide contra la cadencia REAL del periodo (`cadencia_seg`, "
    "moda de los saltos reales entre filas) y las horas de sol del dia: la cadencia "
    "cambio de 2 s a 15 s, 1 min y 5 min segun la epoca, y medir todo contra el "
    "nominal daba 4% de completitud como si se hubieran perdido datos que nunca se "
    "tomaron. `cadencia_origen` = 'nominal' avisa que el periodo no tenia ni una "
    "fila con la que medirla y se cayo a la constante. La completitud puede pasar de "
    "1 cuando "
    "el logger grabo fuera de la ventana solar del dia. `completitud` mide contra el "
    "periodo entero y `completitud_dias_con_datos` solo contra los dias que grabaron: "
    "la primera incluye el logger apagado, la segunda es la perdida de puntos real."
)

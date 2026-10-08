"""Constantes del PR diario: sitio, regla del dt, criterio de dia valido y campos."""
from __future__ import annotations

from historico.analitica import catalogo

# ── Constantes fisicas del sitio (brief seccion 6) ──────────────────────────────
P0_WP = 1420.0                       # 4 x 355 Wp bifaciales por arreglo
KWP_POR_ARREGLO = P0_WP / 1000.0
WH_POR_KWH = 1000.0
SEGUNDOS_POR_HORA = 3600.0

INCLINADO, VERTICAL = "inclinado", "vertical"   # PV1 = 20/150, PV2 = 90/50

# ── La generalizacion del 5/60 de R1 ────────────────────────────────────────────
# La cadencia NOMINAL del store: la unica que hace verdadera la formula literal de
# Leo, y solo el 21% de las filas de radiacion la cumple (las demas van a 15, 30,
# 45, 60, 75, 315 o 330 s).
CADENCIA_NOMINAL_SEG = 300
# Techo del dt, el doble de la nominal: el mismo criterio de "intervalo excesivo"
# que ya usa el barrido de calidad. SIN techo, el salto nocturno de 40.200 s se
# integraria como once horas de sol.
TECHO_DT_SEG = 2 * CADENCIA_NOMINAL_SEG
# La ultima fila del dia no tiene siguiente: se le acredita la cadencia nominal.
DT_ULTIMA_FILA_SEG = CADENCIA_NOMINAL_SEG
# Horas que la formula LITERAL de R1 atribuye a cada fila, mida lo que mida.
HORAS_FORMULA_LITERAL = 5.0 / 60.0

# POR QUE NO SE IMPLEMENTA EL `5/60` LITERAL, con el numero que lo justifica:
# sobre la ventana util infla la irradiacion un +83,6% (factor 1,84x), pero el error
# CAMBIA DE SIGNO segun el mes: +860% en octubre 2025 (cadencia real de 15 y 60 s)
# contra -6,6% en diciembre 2025 (cadencia real de 315 s, no 300). En marzo-junio
# 2026, cuando la cadencia SI es de 300 s, las dos formulas coinciden dentro del
# 0,2% y Leo tiene razon exacta. Un sesgo que cambia de signo no se descuenta con
# una constante: aplicada literal, la formula le inventa a la serie una
# estacionalidad falsa de un orden de magnitud, dictada por cuando cambio la
# cadencia del registrador y no por el sol (octubre se leeria como "los paneles se
# estropearon" y diciembre como "el invierno rinde mejor"). El modulo calcula IGUAL
# la version literal y la publica en `error_formula_literal`: apartarse de lo que
# pidio Leo obliga a mostrar cuanto costaba obedecerlo, no a esconder la diferencia.

# ── Criterio de dia valido, contra `ventana_solar.horas_sol` ────────────────────
COBERTURA_MINIMA = 0.90
# El criterio que DE VERDAD filtra, y el unico que no es obvio: dos coberturas
# aceptables por separado pueden cubrir tramos distintos del dia. Caso real, el
# 2026-03-09: 4,97 h de radiacion contra 9,67 h de electrico.
DESFASE_MAXIMO_H = 0.5

SIN_RADIACION = "sin_radiacion"
SIN_ELECTRICO = "sin_electrico"
SIN_VENTANA_SOLAR = "sin_ventana_solar"
COBERTURA_INSUFICIENTE = "cobertura_insuficiente"
DESFASE_EXCESIVO = "desfase_excesivo"

# ── Limite fisico del PR ────────────────────────────────────────────────────────
# Ningun arreglo entrega mas energia que la luz que recibe por kWp instalado. Un PR
# por encima de esto NO es un buen resultado: es la prueba de que el insumo de
# irradiancia de ese arreglo esta mal. Con POA frontal sola el vertical da 1,217
# anual y supera 1 en 138 de 197 dias, con maximo 3,19.
PR_MAXIMO_FISICO = 1.0

# ── Contaminacion que la vista corregida todavia no limpia ──────────────────────
# `v_sc_electrico_corregido` aplica CASE a voltaje, corriente, potencia y
# temperatura pero PASA LAS CUATRO COLUMNAS DE ENERGIA SIN TOCAR, asi que las filas
# del piranometro mezcladas entran enteras (203.194,6 en `energia_pv1_wh` y
# 39.328.367,1 en `energia_total_wh`; la del 2026-03-09 trae 137,25 en
# `energia_hoy_wh`).
#
# El criterio es la FIRMA DE FILA compartida (`analitica.contaminacion`), la misma
# que usa `energia.py` y la misma que aplicara la vista. Antes aca habia una lista
# de dos timestamps fijos: atrapaba las dos filas sucias CONOCIDAS y ninguna de las
# que apareciera despues. La firma no depende de haber ido a buscarlas una por una.
#
# MIGRACION: `sql/003_electrico_sin_falsos_positivos.sql` mete esta misma firma en
# la vista. Cuando este aplicada, el CTE `sucias` y su anti-join se retiran de esta
# consulta y el resultado no cambia. Hasta entonces son la unica defensa.
#
# El tope por VALOR es otra cosa y se queda: es lo unico de que dispone
# `cierre_del_contador`, que recibe una sola columna y no puede mirar el resto de la
# fila. Sale del catalogo para que no haya dos numeros que puedan separarse.
MAXIMO_CONTADOR_DIARIO_KWH = catalogo.obtener("energia_pv1_wh").maximo

# ── Las dos fuentes de energia y los tres insumos de irradiancia ────────────────
CONTADOR, INTEGRAL = "contador", "integral"
FUENTES_ENERGIA = (CONTADOR, INTEGRAL)

GHI, POA_BIFACIAL, POA_FRONTAL = "ghi", "poa_bifacial", "poa_frontal"
INSUMOS = (GHI, POA_BIFACIAL, POA_FRONTAL)
# Los dos que dependen de una transposicion MODELADA y que R2 dejo esperando a Hugo.
INSUMOS_PROVISIONALES = (POA_BIFACIAL, POA_FRONTAL)

# insumo -> (columna de irradiacion del inclinado, la del vertical). Contra GHI el
# denominador es el MISMO para los dos arreglos, asi que PR1/PR2 es identico a
# E1/E2: mide cuanta energia da cada geometria, no que tan bien convierte. Es la
# variante que describe R1 y la unica que no depende de un modelo.
_CAMPO_IRRADIACION = {
    GHI: ("ghi_wh_m2", "ghi_wh_m2"),
    POA_BIFACIAL: ("poa1_bif_wh_m2", "poa2_bif_wh_m2"),
    POA_FRONTAL: ("poa1_front_wh_m2", "poa2_front_wh_m2"),
}
# fuente -> (columna del inclinado, la del vertical, factor a kWh)
_CAMPO_ENERGIA = {
    CONTADOR: ("e1_contador_kwh", "e2_contador_kwh", 1.0),
    INTEGRAL: ("e1_integral_wh", "e2_integral_wh", 1.0 / WH_POR_KWH),
}

# Claves del CATALOGO de las que depende la respuesta. `confianza` las mira UNA POR
# UNA: sin esto una columna rota ajena condena el periodo entero.
CLAVES_POA = ("poa_pv1_wm2", "poa_pv2_wm2")
# Los contadores del camino PRINCIPAL. Van en `CLAVES` desde que el catalogo los
# registra y los vigila: sin ellos `confianza` no podia castigar nunca la ruta de
# calculo que este modulo declara principal, y respondia por la integral de la
# potencia como si fuera el unico insumo.
CLAVES_CONTADOR = ("energia_pv1_wh", "energia_pv2_wh")
CLAVES = ["potencia_pv1_w", "potencia_pv2_w", *CLAVES_CONTADOR,
          "irradiancia_incidente_wm2", *CLAVES_POA]

_CAMPOS_DEL_DIA = ("dia", "valido", "motivos_descarte", "cobertura_radiacion",
                   "cobertura_electrico", "desfase_h", "horas_sol", "horas_rad",
                   "horas_ele", "ghi_wh_m2", "e1_contador_kwh", "e2_contador_kwh",
                   "e1_integral_wh", "e2_integral_wh")

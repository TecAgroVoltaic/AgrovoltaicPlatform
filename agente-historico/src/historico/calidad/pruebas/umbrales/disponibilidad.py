"""Familia 5: disponibilidad del EQUIPO (no del dato). Ver la cabecera de `umbrales`."""
from __future__ import annotations

from datetime import date, time

# ══ Familia 5: disponibilidad del EQUIPO (no del dato) ══════════════════════
# Nace de R3 de Leo Cardinale (`docs/referencia/respuestas-lcv-consultas.md`):
#
#   "si indicas que marca 0V en la noche, quiere decir que corresponde a la
#    tension AC que genera el inversor; siendo asi, si vale la pena que el
#    sistema detecte cuando se da este caso durante el dia; digamos entre
#    7am-5pm; porque quiere decir que el sistema no esta tratando de acoplarse
#    a la red AC (...) si hay irradiancia mayor a unos 300W/m2, todas las
#    variables dichas deberian ser mayores a 0."
#
# El 0 de estas tres NO es un dato invalido: es la lectura EXACTA de un inversor
# que no se acoplo. Por eso los cortes de esta familia viven aca y no en
# `catalogo.minimo/.maximo`, que es la fuente de verdad de la validez FISICA.

# ORIGEN: DOCUMENTO (R3, "digamos entre 7am-5pm"). Ventana FIJA y no la solar de
# `ventana_solar`: medido, la ventana solar pasa de 95 a 224 dias marcados
# (+136 %), que es la falsa alarma que el propio Leo anticipo. Y es un criterio
# OPERATIVO (cuando hay alguien para ir a revisar), no astronomico.
# HORA LOCAL de Costa Rica, sin conversion de zona: los timestamps del store
# estan etiquetados `+00` y mienten. Un `AT TIME ZONE` correria la ventana seis
# horas y la prueba mediria la madrugada.
VENTANA_OPERATIVA_DESDE = time(7, 0)
VENTANA_OPERATIVA_HASTA = time(17, 0)          # EXCLUSIVO, como el resto del repo

# ORIGEN: DOCUMENTO (R3, "unos 300 W/m2"). NO es un filtro: es el GRADUADOR de
# severidad. Ver la justificacion medida en `disponibilidad.py`.
# El conteo de dias es estable entre 300 y 500 (69, 67 y 63 dias): el umbral cae
# en una meseta y no en una pendiente. Revisar cuando se calibre la irradiancia:
# la serie sigue sin calibrar y un 0,3 % pasa de 1.500 W/m2.
IRRADIANCIA_QUE_EXIGE_GENERACION_WM2 = 300.0

# Las tres variables de R3 ("lo mismo aplica para frecuencia y potencia total").
# Doble uso deliberado: `disponibilidad` las vigila y `validez_fisica` las exime
# del hallazgo de rango CUANDO VALEN CERO. Una sola lista para las dos caras de
# la misma decision; en dos listas, una se actualiza y la otra no.
VARIABLES_DE_ACOPLE_AC = ("voltaje_vac", "frecuencia_hz", "potencia_total_wac")

# ORIGEN: DATO. La ventana con que se empareja lo electrico contra la radiacion.
# Es `date_bin('5 minutes', ...)`, NUNCA igualdad de timestamp: por bin se
# empareja el 94,5 % de las lecturas marcadas (5.979 de 6.330) y por igualdad
# exacta solo 818, o sea se pierde el 87,1 %.
BIN_DE_EMPAREJAMIENTO_SEG = 300

# ORIGEN: DATO + POLITICA. `v_sc_radiacion_corregida` devuelve NULL antes de esta
# fecha (la irradiancia previa se descarta por decision del equipo). Son 46 de
# los 274 dias con dato electrico, y ahi la severidad no se puede graduar: el
# hallazgo sale igual, con este motivo, para que el hueco se lea como hueco.
IRRADIANCIA_UTIL_DESDE = date(2025, 7, 1)

# LA RAMPA DE ARRANQUE. ORIGEN: DATO (medido al bajar a 0 el piso de rango de las
# dos columnas): hay 82 lecturas de `voltaje_vac` entre 0 y 100 V y 120 de
# `frecuencia_hz` entre 0 y 55 Hz. NO son basura: es el inversor despertando al
# amanecer (99,79 V con 28,0 Hz y 0 W de salida es una de ellas).
#
# La prueba marca `= 0` y no "por debajo de esto", y es deliberado:
#   * R3 dice "deberian ser MAYORES A CERO", y todo el rendimiento medido de la
#     regla (6.330 lecturas en 95 dias, 41 de 41 dias de planta parada) sale de
#     ese criterio. Ensancharlo cambia el rendimiento sin medirlo de nuevo.
#   * La rampa ya cae sola: esas lecturas tienen `potencia_total_wac = 0`, que es
#     uno de los tres disyuntos de la regla, y ademas ocurren cerca del amanecer
#     (05:26), o sea casi siempre FUERA de la ventana 07:00-17:00.
#   * Un inversor despertando no es un inversor averiado. Marcarlo como falta de
#     disponibilidad seria la falsa alarma que el propio Leo pidio evitar.
#
# Lo que si hace falta es que NO se lea como sistema sano: estos pisos siguen
# nombrados para contar cuantas lecturas de la rampa hay en el dia y decirlo en
# el detalle del hallazgo. Es el mismo piso que dejo de ser un rango de validez
# fisica, reusado para lo unico que sabe hacer: nombrar el arranque.
# QUEDA SIN MEDIR (y anotado como tal): un dia con lecturas de rampa DENTRO de
# 07-17 y sin ningun cero no genera hallazgo. Si el equipo lo quiere vigilar hay
# que medir su rendimiento antes de convertirlo en regla.
RAMPA_DE_ARRANQUE_POR_VARIABLE: dict[str, float] = {
    "voltaje_vac": 100.0,
    "frecuencia_hz": 55.0,
}

# Los motivos con que sale graduado (o no) cada hallazgo de disponibilidad.
MOTIVO_BAJO_SOL = "bajo_sol"
MOTIVO_IRRADIANCIA_BAJA = "irradiancia_baja"
MOTIVO_SIN_IRRADIANCIA = "sin_irradiancia"

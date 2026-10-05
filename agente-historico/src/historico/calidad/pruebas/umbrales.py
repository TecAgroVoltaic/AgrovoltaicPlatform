"""TODOS los umbrales de las cinco familias de pruebas, en un solo modulo.

Existe para que el resto del paquete no tenga ni un numero suelto. Un umbral en
medio de un `if` es indiscutible: nadie sabe de donde salio, nadie se atreve a
moverlo y nadie puede auditarlo contra el documento. Aca cada constante lleva su
ORIGEN anotado, y el origen es de una de tres clases:

  * DOCUMENTO   el valor esta escrito en el PDF de evaluacion de datos.
  * DATO        salio de medir esta serie (y hay que volver a medirlo si cambia).
  * POLITICA    el documento pide la prueba pero no fija el corte; lo fijamos aca
                y queda a la vista para discutirlo con el equipo.

## Los limites por variable NO se escriben aca, y es a proposito

"Irradiancia < 0", "irradiancia > 1500", "RH > 100", "temperatura ambiente < -5"
y compañia son limites POR VARIABLE, y su fuente de verdad es
`analitica.catalogo` (campos `minimo` y `maximo`), que ademas es la allowlist de
SQL. Copiarlos aca crearia una segunda verdad que se desincroniza en la primera
correccion. Lo que si vive aca es `LIMITES_DEL_DOCUMENTO`: la trazabilidad de que
prueba del PDF corresponde a que entrada del catalogo, que la prueba de
regresion usa para verificar que ninguna se perdio por el camino.
"""
from __future__ import annotations

from datetime import date, time

# ══ Severidad: cuando un hallazgo pasa de anecdota a problema ═══════════════
# ORIGEN: POLITICA. El documento cuenta ocurrencias pero no gradua. El corte de
# 0,20 es el mismo que ya usa `calidad.contexto.FRACCION_MATERIAL` para decidir
# si un dia es utilizable: si aca se usara otro, un hallazgo podria salir "grave"
# y aun asi no invalidar el dia, que es justo la incoherencia que nadie detecta.
FRACCION_AFECTADA_PARA_AVISO = 0.05
FRACCION_AFECTADA_PARA_GRAVE = 0.20

# ══ Familia 2: validez fisica ═══════════════════════════════════════════════
LADO_MINIMO, LADO_MAXIMO = "minimo", "maximo"

# Trazabilidad PDF -> catalogo. Cada tupla es (clave de catalogo, lado, texto del
# documento). La prueba generica lee el numero de `catalogo.obtener(clave)`.
# ORIGEN: DOCUMENTO (la lista de pruebas de validez fisica, sin los numeros).
LIMITES_DEL_DOCUMENTO: tuple[tuple[str, str, str], ...] = (
    ("irradiancia_incidente_wm2", LADO_MINIMO, "irradiancia < 0"),
    ("irradiancia_incidente_wm2", LADO_MAXIMO, "irradiancia > 1500 W/m2"),
    ("humedad_relativa_pct", LADO_MAXIMO, "RH > 100 %"),
    ("humedad_relativa_pct", LADO_MINIMO, "RH < 0 %"),
    ("temperatura_ambiente_c", LADO_MINIMO, "temperatura ambiente < -5 C"),
    ("temperatura_ambiente_c", LADO_MAXIMO, "temperatura ambiente > 50 C"),
    ("velocidad_viento_ms", LADO_MINIMO, "viento < 0"),
    ("precipitacion_mm", LADO_MINIMO, "precipitacion < 0"),
)

# Irradiancia de noche. El documento dice "contrastar contra la altura solar";
# la altura solar del sitio ya esta resuelta dia por dia en `ventana_solar`
# (amanecer y atardecer, calculados con pvlib por `calidad/sol.py`), asi que la
# prueba compara la marca contra esa ventana en vez de recalcular geometria.
#
# El margen de crepusculo NO es una concesion: entre el amanecer geometrico y el
# civil hay luz difusa real y medible en el tropico, y sin margen todo dia sano
# generaria hallazgos en sus dos bordes. ORIGEN: POLITICA.
MARGEN_CREPUSCULO_MINUTOS = 30.0
# Por debajo de esto, de noche, es el suelo de ruido del piranometro sin
# calibrar, no radiacion. ORIGEN: POLITICA (el offset nocturno conocido de la
# serie es -38,845 W/m2 y la vista corregida lo lleva a 0).
IRRADIANCIA_NOCTURNA_TOLERADA_WM2 = 5.0

# ══ Familia 3: consistencia temporal ════════════════════════════════════════
# LA TRAMPA: la cadencia esperada NO es una sola. El historico tiene tramos a
# 2 s (dic 2024), 1 min (may 2025) y 5 min (nov 2025+), y la columna
# `intervalo_original_seg` lo declara fila por fila. Una prueba con cadencia fija
# marcaria media base como hueco. Ver `cadencia.py`: lo que manda es el valor
# declarado por fila; estos nominales son el ultimo recurso.
# ORIGEN: DOCUMENTO (5 min lo electrico, 15 s la radiacion).
CADENCIA_NOMINAL_POR_FUENTE: dict[str, float] = {
    "monitoreo_sc_electrico": 300.0,
    "radiacion_sc_15s": 15.0,
}
CADENCIA_NOMINAL_POR_DEFECTO = 300.0
# ORIGEN: DATO. Los regimenes realmente presentes en la serie, para el detalle
# del hallazgo (que un tramo declare 2 s no es un error, es diciembre 2024).
CADENCIAS_HISTORICAS_SEG: tuple[float, ...] = (2.0, 6.0, 60.0, 300.0)

# ORIGEN: DOCUMENTO ("intervalos mayores a 2x la tasa de muestreo esperada").
FACTOR_INTERVALO_EXCESIVO = 2.0
# "Fluctuaciones en las marcas de tiempo": el documento pide la prueba y no fija
# el corte. Un intervalo que se aparta mas de un 10 % de la cadencia de su tramo
# sin llegar a ser hueco es jitter del logger. ORIGEN: POLITICA.
TOLERANCIA_FLUCTUACION = 0.10

# ══ Familia 4: anomalias estadisticas ═══════════════════════════════════════
# ORIGEN: DOCUMENTO. Los tres saltos, tal cual el PDF.
SALTO_MAXIMO_TEMPERATURA_C = 3.0
SALTO_MAXIMO_HUMEDAD_RELATIVA_PCT = 15.0
SALTO_MAXIMO_IRRADIANCIA_WM2 = 300.0

# A que variables del catalogo aplica cada salto. Una variable que no este aca no
# tiene umbral de salto definido y la prueba se reporta `no_aplica` en vez de
# inventarle uno.
SALTO_MAXIMO_POR_VARIABLE: dict[str, float] = {
    "temp_inclinado": SALTO_MAXIMO_TEMPERATURA_C,
    "temp_vertical": SALTO_MAXIMO_TEMPERATURA_C,
    "temperatura_inversor_c": SALTO_MAXIMO_TEMPERATURA_C,
    "temperatura_ambiente_c": SALTO_MAXIMO_TEMPERATURA_C,
    "humedad_relativa_pct": SALTO_MAXIMO_HUMEDAD_RELATIVA_PCT,
    "irradiancia_incidente_wm2": SALTO_MAXIMO_IRRADIANCIA_WM2,
    "irradiancia_reflejada_wm2": SALTO_MAXIMO_IRRADIANCIA_WM2,
    "irradiancia_incidente_sp722_wm2": SALTO_MAXIMO_IRRADIANCIA_WM2,
    "irradiancia_reflejada_sp722_wm2": SALTO_MAXIMO_IRRADIANCIA_WM2,
    "poa_pv1_wm2": SALTO_MAXIMO_IRRADIANCIA_WM2,
    "poa_pv2_wm2": SALTO_MAXIMO_IRRADIANCIA_WM2,
}

# AMBIGUEDAD DEL PDF (1 de 2): "salto de temperatura > 3 C entre mediciones" no
# dice entre mediciones separadas por CUANTO. A 15 s son 720 C/h y es imposible;
# a 5 min son 36 C/h y es una tarde con nubes; a 1 h es normal. El umbral se
# aplica NORMALIZADO a esta cadencia de referencia (ver `anomalias.salto_excesivo`),
# que por eso es un parametro con nombre y no un numero enterrado.
# ORIGEN: POLITICA. Por fuente, porque cada una tiene su tasa nominal.
CADENCIA_REFERENCIA_DE_SALTO_POR_FUENTE: dict[str, float] = dict(CADENCIA_NOMINAL_POR_FUENTE)
CADENCIA_REFERENCIA_DE_SALTO_SEG = CADENCIA_NOMINAL_POR_DEFECTO

# ORIGEN: DOCUMENTO ("flatline de 30 mediciones consecutivas").
FLATLINE_MEDICIONES_CONSECUTIVAS = 30
# ORIGEN: DOCUMENTO ("outlier fuera de [Q1 - 1,5*IQR, Q3 + 1,5*IQR]").
FACTOR_IQR = 1.5
# ORIGEN: DOCUMENTO ("el cambio absoluto supera media + 6*desviacion absoluta").
FACTOR_DESVIACION_DE_RUIDO = 6.0

# AMBIGUEDAD DEL PDF (2 de 2): "desviacion absoluta maxima". Ver la discrepancia
# documentada en `anomalias.ruido_excesivo`. Las dos lecturas quedan disponibles.
DESVIACION_MAD = "mad"
DESVIACION_MAXIMA = "maxima"

# Cuantas muestras hacen falta para que un cuartil o una mediana signifiquen algo.
# Con menos, el IQR de un dia lo fija una sola lectura. ORIGEN: POLITICA (mismo
# valor que `config.MIN_MUESTRAS_DIA`, que es lo que ya aplica el barrido).
MINIMO_MUESTRAS_PARA_ESTADISTICA = 12

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

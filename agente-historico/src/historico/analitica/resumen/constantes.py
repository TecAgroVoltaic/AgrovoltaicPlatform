"""Constantes del tablero: potencia, ventanas, umbrales de frescura y la nota."""
from __future__ import annotations

from historico.analitica import energia

# Wp instalados por arreglo (4 x 355 Wp bifaciales). El rendimiento especifico
# (kWh/kWp) divide por esta potencia expresada en kWp.
POTENCIA_NOMINAL_WP = 1420.0
_KWP_POR_ARREGLO = POTENCIA_NOMINAL_WP / 1000.0

DIAS_VENTANA_RECIENTE = 7
DIAS_POR_ANO = 365

# A partir de cuantos dias sin reportar la frescura deja de ser un dato neutro. El
# logger graba a diario: un par de dias de atraso es operacion normal, una semana
# es que el sistema se detuvo y todo KPI de abajo habla de un pasado, no del hoy.
DIAS_ANTIGUEDAD_TOLERABLE = 2
DIAS_ANTIGUEDAD_ALARMANTE = 7

AL_DIA, REZAGADA, DETENIDA, SIN_DATOS = "al_dia", "rezagada", "detenida", "sin_datos"

# De que columnas depende esta respuesta: se le pasa a `confianza` para que el
# veredicto mire SOLO estas y no condene el periodo por una columna ajena rota.
# Van las cuatro porque el tablero mezcla las dos familias: el total es AC de
# contador y las casillas por arreglo son DC de potencia.
COLUMNAS = energia.COLUMNAS
_FUENTE = "monitoreo_sc_electrico"

_NOTA = (
    "el total del periodo es AC, leido del contador `energia_hoy_wh` del inversor "
    "(R7 de Leo Cardinale), NO la integral de la potencia. Las casillas por arreglo "
    "SI son DC integrada, porque el inversor no reporta AC por arreglo: por eso el "
    "total AC y la suma de los dos arreglos no coinciden, y "
    "`energia_ac.coherencia_ac_dc` dice si la diferencia es la esperada. `energia_ac` "
    "trae ademas las DOS energias que el sistema puede responder (la que quedo "
    "registrada y la que produjo la planta) con su significado. El rendimiento "
    "anualizado se normaliza por DIAS CON DATOS (`dias_con_datos`), no por "
    "calendario: los dias sin reportar son un hueco de logging y no de generacion. "
    "Cuanto del periodo se midio esta en `confianza`."
)

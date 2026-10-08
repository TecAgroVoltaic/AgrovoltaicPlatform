"""Familia 3: consistencia temporal. Ver la cabecera de `umbrales`."""
from __future__ import annotations

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

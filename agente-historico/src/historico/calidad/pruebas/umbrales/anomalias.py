"""Familia 4: anomalias estadisticas. Ver la cabecera de `umbrales`."""
from __future__ import annotations

from historico.calidad.pruebas.umbrales.temporal import (
    CADENCIA_NOMINAL_POR_DEFECTO, CADENCIA_NOMINAL_POR_FUENTE,
)

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

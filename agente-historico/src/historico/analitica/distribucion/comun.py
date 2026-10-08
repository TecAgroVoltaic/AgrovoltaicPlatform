"""Constantes de la Fig. 6 y la rejilla de meses de la ventana (con los vacios)."""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from historico.analitica import fuente
from historico.analitica.ventana import MES, Ventana

# Criterio de outlier del documento: fuera de [Q1 - 1,5*IQR, Q3 + 1,5*IQR].
FACTOR_IQR = 1.5
# 20 años de cajas. Solo frena ventanas absurdas (`ventana.crear()` sin `hasta` abre
# hasta 2100); el historico real son 19 meses.
MAXIMO_MESES = 240
# Una sola lectura no define una integral: no hay intervalo que pesar. Se reporta
# como sin valor en vez de como un cero, que se leeria "ese mes no hubo sol".
MINIMO_LECTURAS_INTEGRAL = 2

IRRADIANCIA_POR_DEFECTO = "irradiancia_incidente_wm2"
UNIDAD_IRRADIANCIA = "W/m2"
UNIDAD_IRRADIACION = "kWh/m2"
# (W/m2) * s = J/m2; entre esto queda kWh/m2.
JULIOS_POR_KWH = 3_600_000.0

FORMATO_MES = "%Y-%m"
_FORMATO_MES_SQL = "YYYY-MM"


def _meses(v: Ventana) -> list[datetime]:
    """Los meses de la ventana, incluidos los que no tienen ni una lectura."""
    mensual = replace(v, granularidad=MES)
    fuente.validar_tamano(mensual, MAXIMO_MESES)
    return fuente.rejilla(mensual)

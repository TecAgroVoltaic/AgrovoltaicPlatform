"""Ayudantes comunes a las consultas: origen segun el catalogo, reloj y fecha."""
from __future__ import annotations

from datetime import date, datetime

from historico.calidad.pruebas.contrato import CORREGIDA, CRUDO, DERIVADA

# Relaciones que traen `intervalo_original_seg` (la cadencia declarada fila por
# fila). `radiacion_sc_poa` y `radiacion_sc_clearsky` son tablas MODELADAS y no la
# tienen: para ellas la cadencia se infiere del propio dia.
RELACIONES_CON_INTERVALO = ("v_sc_electrico_corregido", "v_sc_radiacion_calibrada",
                            "v_sc_radiacion_corregida", "monitoreo_sc_electrico",
                            "radiacion_sc_15s")


def _columna_intervalo(relacion: str) -> str:
    """La cadencia declarada fila por fila, o NULL en las tablas modeladas."""
    return ("intervalo_original_seg" if relacion in RELACIONES_CON_INTERVALO
            else "NULL::double precision")


def _sin_etiqueta(valor) -> datetime:
    """El timestamp del store como datetime naive. Ver el docstring del modulo."""
    marca = datetime.fromisoformat(valor) if isinstance(valor, str) else valor
    return marca.replace(tzinfo=None)


def _origen(variable, crudo: bool) -> tuple[str, str, str]:
    """(relacion, columna, etiqueta de origen) segun lo que declare el catalogo."""
    if not crudo:
        return variable.relacion, variable.columna, CORREGIDA
    sin_corregir = variable.origen_crudo
    if sin_corregir is None:
        # Variable derivada: no hay crudo que pedir. Se sirve de la vista, pero
        # etiquetada, para que la evaluacion no la trate como una lectura.
        return variable.relacion, variable.columna, DERIVADA
    return (*sin_corregir, CRUDO)


def _como_fecha(valor) -> date:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return date.fromisoformat(str(valor)[:10])

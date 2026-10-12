"""Que fallo, por que y que hacer: el contexto de un error para el modelo y para el reporte.

Regla del producto (2026-10-12): si algo falla, el agente SIEMPRE recibe el porque y
lo cuenta, y lo que no es culpa de quien pregunta se reporta al sistema. Un
`str(exc)` suelto no alcanza: el modelo no distingue "pediste mal la fecha" de "la
base no responde", y en el segundo caso tiende a inventar un motivo.

`describir` es puro: clasifica la excepcion. Reportar es de `agent.notificar`.
"""
from __future__ import annotations

from concurrent.futures import TimeoutError as FuturoVencido

from historico.agrodash_api import AgroDashNoDisponible

PARAMETRO = "parametro_invalido"
FUENTE = "fuente_no_disponible"
BASE = "base_no_disponible"
TIEMPO = "tiempo_agotado"
INTERNO = "error_interno"

_SUGERENCIA = {
    PARAMETRO: "Corregi el parametro y reintenta; si no se puede, explicale al usuario que falta.",
    FUENTE: ("AgroDash (API externa) no respondio. Decilo asi, ofrece lo que si hay en Supabase "
             "y que se puede reintentar en unos minutos. No inventes otra causa."),
    BASE: ("La base de datos no respondio. Decilo asi y que se puede reintentar en unos minutos. "
           "No inventes otra causa."),
    TIEMPO: "La consulta tardo demasiado. Ofrece un rango mas corto o menos variables.",
    INTERNO: ("Fallo interno de la herramienta. Decile al usuario que fallo y que quedo "
              "reportado; no inventes datos ni causas."),
}


def _tipo(exc: BaseException) -> str:
    if isinstance(exc, AgroDashNoDisponible):
        return FUENTE
    if isinstance(exc, (TimeoutError, FuturoVencido)):
        return TIEMPO
    modulo = type(exc).__module__ or ""
    if modulo.startswith(("psycopg", "psycopg_pool")):
        return BASE
    if isinstance(exc, (ValueError, KeyError, TypeError)):
        return PARAMETRO
    return INTERNO


# Que sistema fallo, para agrupar: una caida de AgroDash es UNA causa aunque la
# vean diez herramientas distintas.
_ORIGEN = {FUENTE: "agrodash", BASE: "supabase"}


def origen(tipo: str, herramienta: str) -> str:
    return _ORIGEN.get(tipo, herramienta)


def describir(exc: BaseException, herramienta: str) -> dict:
    """`{tipo, herramienta, origen, detalle, sugerencia, reportar}` de una excepcion."""
    tipo = _tipo(exc)
    detalle = str(exc).strip() or type(exc).__name__
    return {"tipo": tipo, "herramienta": herramienta, "origen": origen(tipo, herramienta),
            "detalle": f"{type(exc).__name__}: {detalle}"[:400],
            "sugerencia": _SUGERENCIA[tipo],
            # Un parametro mal puesto lo corrige el modelo en el turno: no es del sistema.
            "reportar": tipo != PARAMETRO}

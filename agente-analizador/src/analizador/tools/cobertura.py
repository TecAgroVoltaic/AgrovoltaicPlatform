"""Tool `cobertura_datos` — que datos hay: rango disponible y conteos en un periodo.

Responde "de cuando a cuando hay datos" y "cuantas filas hay" en el periodo pedido,
para que el analisis sepa si una respuesta se apoya en muchos o pocos datos.
"""
from __future__ import annotations

from analizador import db
from analizador.periodo import rango

SCHEMA = {
    "name": "cobertura_datos",
    "description": (
        "Cobertura de datos: rango de fechas disponible y cuantas filas hay (electrico "
        "5 min y radiacion 15 s) en el periodo. Sirve para saber si hay suficientes datos. "
        "Omiti desde/hasta para contar todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "Inicio ISO, hora local CR. Omitir = todo."},
            "hasta": {"type": "string", "description": "Fin ISO EXCLUSIVO. Omitir = todo."},
        },
        "additionalProperties": False,
    },
}


def run(desde: str | None = None, hasta: str | None = None) -> dict:
    d, h = rango(desde, hasta)
    disponible = db.uno(
        """
        SELECT min(timestamp) AS disponible_desde, max(timestamp) AS disponible_hasta
        FROM monitoreo_sc_electrico
        """
    )
    conteo = db.uno(
        """
        SELECT
          (SELECT count(*) FROM monitoreo_sc_electrico
             WHERE timestamp >= %s AND timestamp < %s) AS filas_electrico_5min,
          (SELECT count(*) FROM radiacion_sc_15s
             WHERE timestamp >= %s AND timestamp < %s) AS filas_radiacion_15s
        """,
        (d, h, d, h),
    )
    return {
        "periodo": {"desde": d, "hasta": h},
        **disponible,
        **conteo,
        "nota": "los datos son historicos (no en vivo); hay gaps largos (ene-abr y jul-ago 2025)",
    }

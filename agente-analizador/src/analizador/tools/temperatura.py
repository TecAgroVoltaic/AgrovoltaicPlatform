"""Tool `temperatura_por_arreglo` — temperatura de cada arreglo en un periodo.

temp_inclinado = arreglo PV1 (inclinado); temp_vertical = arreglo PV2 (vertical).
Sensores DS18B20, ya corregidos (error 85 C y fuera de 10-80 -> NULL en la vista).
"""
from __future__ import annotations

from analizador import db
from analizador.periodo import rango

SCHEMA = {
    "name": "temperatura_por_arreglo",
    "description": (
        "Temperatura (C) de cada arreglo en un periodo: PV1 inclinado y PV2 vertical "
        "(media y maxima). Util para el efecto de temperatura en el rendimiento. "
        "Omiti desde/hasta para todo el historico."
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
    fila = db.uno(
        """
        SELECT
          round(avg(temp_inclinado)::numeric, 1) AS temp_pv1_inclinado_media_c,
          round(max(temp_inclinado)::numeric, 1) AS temp_pv1_inclinado_max_c,
          round(avg(temp_vertical)::numeric, 1)  AS temp_pv2_vertical_media_c,
          round(max(temp_vertical)::numeric, 1)  AS temp_pv2_vertical_max_c,
          count(temp_inclinado) AS n_inclinado,
          count(temp_vertical)  AS n_vertical
        FROM v_sc_electrico_corregido
        WHERE timestamp >= %s AND timestamp < %s
        """,
        (d, h),
    )
    return {
        "periodo": {"desde": d, "hasta": h},
        **fila,
        "nota": "temperaturas validas 10-80 C (el error de sensor 85 C ya se descarto)",
    }

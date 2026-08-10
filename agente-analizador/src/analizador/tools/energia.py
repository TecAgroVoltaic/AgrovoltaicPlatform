"""Tool `energia_por_arreglo` — energia electrica generada por arreglo en un periodo.

Energia = INTEGRAL de la potencia corregida: sum(potencia_W) * (5 min / 60) = Wh.
Se usa la integral y NO el acumulador energia_*_wh para no depender del reset diario.
Fuente: v_sc_electrico_corregido (potencia ya con limites de validez aplicados).
"""
from __future__ import annotations

from analizador import db
from analizador.periodo import rango

_INTERVALO_H = 5.0 / 60.0  # cada fila = una ventana de 5 min

SCHEMA = {
    "name": "energia_por_arreglo",
    "description": (
        "Energia electrica generada (Wh) en un periodo: por arreglo (PV1 inclinado, "
        "PV2 vertical) y total AC del inversor. Omiti desde/hasta para todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {
                "type": "string",
                "description": "Inicio ISO ('2026-01-01'), hora local CR. Omitir = desde el inicio.",
            },
            "hasta": {
                "type": "string",
                "description": "Fin ISO EXCLUSIVO. Omitir = hasta el final del historico.",
            },
        },
        "additionalProperties": False,
    },
}


def run(desde: str | None = None, hasta: str | None = None) -> dict:
    d, h = rango(desde, hasta)
    fila = db.uno(
        """
        SELECT
          round((sum(potencia_pv1_w)    * %s)::numeric, 1) AS energia_pv1_inclinado_wh,
          round((sum(potencia_pv2_w)    * %s)::numeric, 1) AS energia_pv2_vertical_wh,
          round((sum(potencia_total_wac)* %s)::numeric, 1) AS energia_ac_total_wh,
          count(potencia_pv1_w)     AS n_pv1,
          count(potencia_pv2_w)     AS n_pv2,
          count(potencia_total_wac) AS n_ac,
          count(*) AS ventanas_5min
        FROM v_sc_electrico_corregido
        WHERE timestamp >= %s AND timestamp < %s
        """,
        (_INTERVALO_H, _INTERVALO_H, _INTERVALO_H, d, h),
    )
    return {
        "periodo": {"desde": d, "hasta": h},
        **fila,
        "nota": ("energia = integral de potencia a 5 min; los huecos no suman. IMPORTANTE: "
                 "AC (n_ac) y DC (n_pv1/n_pv2) NO son comparables si su cobertura difiere; "
                 "en tramos con distinta cobertura la AC puede salir menor que la suma DC por "
                 "faltarle ventanas, NO por perdidas del inversor. Compara AC vs DC solo cuando "
                 "n_ac ~= n_pv1+n_pv2 en cadencia."),
    }

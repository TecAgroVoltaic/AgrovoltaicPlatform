"""Tool `irradiancia_resumen` — irradiancia (GHI) e indice de cielo despejado kt*.

Solo datos VALIDOS y con QC (valido AND qc_ok) de v_sc_radiacion_calibrada. La
insolacion (Wh/m2) = integral de la GHI a 15 s = sum(GHI) * (15 s / 3600).
"""
from __future__ import annotations

from analizador import db
from analizador.periodo import rango

_INTERVALO_H = 15.0 / 3600.0  # cada fila = una ventana de 15 s

SCHEMA = {
    "name": "irradiancia_resumen",
    "description": (
        "Resumen de irradiancia solar en un periodo: GHI media/maxima (W/m2), "
        "indice de cielo despejado kt* (0-1, cuanto sol real vs cielo despejado) e "
        "insolacion total (Wh/m2). Solo datos validos con control de calidad. "
        "Omiti desde/hasta para todo el historico valido."
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
          count(*) AS n,
          round(avg(irradiancia_incidente_wm2)::numeric, 1) AS ghi_media_wm2,
          round(max(irradiancia_incidente_wm2)::numeric, 1) AS ghi_max_wm2,
          round(avg(kt_star) FILTER (WHERE kt_star IS NOT NULL)::numeric, 3) AS kt_star_medio,
          round((sum(irradiancia_incidente_wm2) * %s)::numeric, 1) AS insolacion_wh_m2
        FROM v_sc_radiacion_calibrada
        WHERE timestamp >= %s AND timestamp < %s
          AND valido AND qc_ok AND irradiancia_incidente_wm2 IS NOT NULL
        """,
        (_INTERVALO_H, d, h),
    )
    return {
        "periodo": {"desde": d, "hasta": h},
        **fila,
        "nota": ("solo datos validos (post-mediados-2025) y con QC; kt* alto = cielo "
                 "despejado, bajo = nublado (San Carlos es muy nuboso)"),
    }

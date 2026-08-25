"""Tool `performance_ratio` — Performance Ratio ponderado por energia, por arreglo.

PR = energia_real / (P0 * insolacion_POA/1000).  P0 = 1420 Wp por arreglo. La POA
es la efectiva bifacial (ya modelada en v_sc_performance). Reporta n (cobertura)
porque los pares potencia+POA con timestamp exacto son POCOS.
"""
from __future__ import annotations

from historico import db
from historico.calidad import contexto
from historico.periodo import rango

_P0 = 1420.0  # Wp instalados por arreglo (4 x 355 Wp)

# De que columnas depende esta respuesta. Se le pasa a `confianza` para que el
# veredicto mire SOLO estas: si no, el periodo se condena porque otra columna
# de la misma tabla esta rota, y eso marca todo en rojo sin distinguir nada.
COLUMNAS = ['potencia_pv1_w', 'potencia_pv2_w', 'irradiancia_incidente']

SCHEMA = {
    "name": "performance_ratio",
    "description": (
        "Performance Ratio (adimensional, ~0-1) por arreglo en un periodo: PV1 "
        "inclinado y PV2 vertical, ponderado por energia. Incluye la cobertura (n). "
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
          round((sum(potencia_pv1_w) FILTER (WHERE pr_pv1 IS NOT NULL)
                / NULLIF(%s * sum(poa_pv1_wm2/1000.0) FILTER (WHERE pr_pv1 IS NOT NULL), 0))::numeric, 3)
            AS pr_pv1_inclinado,
          round((sum(potencia_pv2_w) FILTER (WHERE pr_pv2 IS NOT NULL)
                / NULLIF(%s * sum(poa_pv2_wm2/1000.0) FILTER (WHERE pr_pv2 IS NOT NULL), 0))::numeric, 3)
            AS pr_pv2_vertical,
          count(*) FILTER (WHERE pr_pv1 IS NOT NULL) AS n_pv1,
          count(*) FILTER (WHERE pr_pv2 IS NOT NULL) AS n_pv2
        FROM v_sc_performance
        WHERE timestamp >= %s AND timestamp < %s
        """,
        (_P0, _P0, d, h),
    )
    return {
        "periodo": {"desde": d, "hasta": h},
        # Cuantos dias del periodo son realmente utilizables. Viaja DENTRO de la
        # respuesta a proposito: el numero de arriba se calcula sobre lo que hay,
        # y sin esto el agente reporta un total de enero sin saber que media
        # docena de dias no sirven. Ver historico.calidad.contexto.
        "confianza": contexto.confianza(d, h, COLUMNAS, None),
        **fila,
        "nota": ("PR ponderado por energia. El PV2 vertical incluye ganancia bifacial "
                 "modelada (phi=0.8, a confirmar con datasheet). n = pares potencia+POA usados."),
    }

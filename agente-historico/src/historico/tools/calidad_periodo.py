"""Tool `calidad_periodo` — ¿me puedo fiar de los datos de este periodo?

Es la primera pregunta que hay que hacerse antes de mirar cualquier numero del
historico, y hasta ahora no habia forma de hacerla. Devuelve el veredicto agregado
(cuantos dias sirven, cuantos estan degradados, cuantos no tienen datos) y los
problemas mas frecuentes, que es lo que dice POR QUE no sirven.
"""
from __future__ import annotations

from historico import db
from historico.calidad import contexto
from historico.periodo import rango

SCHEMA = {
    "name": "calidad_periodo",
    "description": (
        "Veredicto de calidad de los datos en un periodo: cuantos dias son utilizables, "
        "cuantos estan degradados y cuantos no tienen datos, mas los problemas mas "
        "frecuentes. Usala ANTES de reportar cualquier agregado del historico, y siempre "
        "que pregunten si los datos sirven o que tan confiable es un periodo. "
        "Omiti desde/hasta para todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "Inicio ISO, hora local CR. Omitir = todo."},
            "hasta": {"type": "string", "description": "Fin ISO EXCLUSIVO. Omitir = todo."},
            "fuente": {
                "type": "string",
                "enum": ["radiacion_sc_15s", "monitoreo_sc_electrico"],
                "description": (
                    "Acota el veredicto a una fuente. Omitir = las dos, y el dia se juzga "
                    "por la peor. Las dos NO estan igual de sanas: conviene acotar."
                ),
            },
        },
        "additionalProperties": False,
    },
}


def run(desde: str | None = None, hasta: str | None = None,
        fuente: str | None = None) -> dict:
    d, h = rango(desde, hasta)
    resumen = contexto.confianza(d, h, fuente)

    cond = ["fecha >= %s", "fecha < %s"]
    params: list = [d, h]
    if fuente:
        cond.append("fuente = %s")
        params.append(fuente)
    frecuentes = db.query(
        f"""SELECT tipo, severidad,
                   count(DISTINCT fecha)    AS dias,
                   count(DISTINCT variable) AS variables,
                   sum(n_afectadas)         AS lecturas
              FROM hallazgos_calidad
             WHERE {' AND '.join(cond)}
             GROUP BY tipo, severidad
             ORDER BY (severidad = 'grave') DESC, dias DESC
             LIMIT 5""",
        tuple(params),
    )
    return {
        "periodo": {"desde": d, "hasta": h},
        "veredicto": resumen,
        "problemas_mas_frecuentes": frecuentes,
        "nota": ("un dia es 'no utilizable' cuando un problema grave toca al menos la "
                 "quinta parte de sus lecturas, o cuando le falta media jornada"),
    }

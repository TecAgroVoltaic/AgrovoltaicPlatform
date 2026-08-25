"""Tool `cielo_periodo` — ¿como estuvo el cielo?

La irradiancia cruda no dice si hubo nubes: casi toda su forma es la parabola del
sol, que depende de la hora y del dia del año. Quitarle esa parabola es el indice
de cielo despejado (kt = medido / teorico con cielo despejado), y con el, "0,9 a
mediodia" y "0,9 a las siete" significan lo mismo.

Pero kt solo dice CUANTA luz llego, no COMO llego. Un dia de kt 0,5 puede ser una
capa uniforme toda la mañana o el sol entrando y saliendo cada dos minutos, y para
un inversor no son lo mismo. Eso lo separa el indice de variabilidad.
"""
from __future__ import annotations

from historico import config, db
from historico.periodo import rango

SCHEMA = {
    "name": "cielo_periodo",
    "description": (
        "Como estuvo el cielo en un periodo: indice de cielo despejado (kt) medio, indice "
        "de variabilidad, reparto de dias entre despejado/parcial/cubierto/variable, y que "
        "fraccion de la irradiancia de cielo despejado se alcanzo. Usala para preguntas "
        "sobre nubes, dias soleados, o por que la generacion fue baja. "
        "Omiti desde/hasta para todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "Inicio ISO, hora local CR. Omitir = todo."},
            "hasta": {"type": "string", "description": "Fin ISO EXCLUSIVO. Omitir = todo."},
            "detalle_diario": {
                "type": "boolean", "default": False,
                "description": "Devolver ademas un renglon por dia (max 400).",
            },
        },
        "additionalProperties": False,
    },
}


def run(desde: str | None = None, hasta: str | None = None,
        detalle_diario: bool = False) -> dict:
    d, h = rango(desde, hasta)
    resumen = db.uno(
        """
        SELECT count(*)                                      AS dias,
               round(avg(kt_medio)::numeric, 3)              AS kt_medio,
               round(avg(indice_variabilidad)::numeric, 2)   AS variabilidad_media,
               count(*) FILTER (WHERE clase = 'despejado')   AS despejados,
               count(*) FILTER (WHERE clase = 'parcial')     AS parciales,
               count(*) FILTER (WHERE clase = 'cubierto')    AS cubiertos,
               count(*) FILTER (WHERE clase = 'variable')    AS variables,
               round((100.0 * sum(energia_medida_whm2)
                      / nullif(sum(energia_cs_whm2), 0))::numeric, 1) AS pct_del_techo
          FROM cielo_diario WHERE fecha >= %s AND fecha < %s
        """,
        (d, h),
    )
    salida = {
        "periodo": {"desde": d, "hasta": h},
        "resumen": resumen,
        "umbrales": {
            "kt_despejado": config.KT_DESPEJADO,
            "kt_cubierto": config.KT_CUBIERTO,
            "variabilidad_para_llamarlo_variable": config.VI_VARIABLE,
        },
        "nota": ("kt = irradiancia medida / la que habria con cielo despejado. La "
                 "caracterizacion arranca en julio 2025: antes la irradiancia tenia un "
                 "error que el equipo corrigio, y esos datos se descartan a proposito"),
    }
    if detalle_diario:
        salida["dias"] = db.query(
            """SELECT fecha, kt_medio, indice_variabilidad, clase,
                      energia_medida_whm2, energia_cs_whm2
                 FROM cielo_diario WHERE fecha >= %s AND fecha < %s
                ORDER BY fecha LIMIT 400""",
            (d, h),
        )
    return salida

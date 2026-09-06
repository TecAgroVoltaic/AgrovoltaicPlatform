"""Tool `crestas_distribucion` — comparar la FORMA de dos sensores (Fig. 7).

Delgada sobre `analitica.crestas.densidades`. Cada grupo trae dos arrays de 200
valores (la densidad y la probabilidad de cola punto a punto) mas la rejilla
comun: con cuatro grupos son mil numeros que solo sirven para pintar la cresta.
Al modelo se le mandan los estadisticos por grupo y la probabilidad de cola SOBRE
EL UMBRAL, que es el numero con el que se decide algo. Las curvas viajan por
`GET /analitica/crestas`.
"""
from __future__ import annotations

from historico.analitica import crestas, ventana
from historico.tools import opciones

SCHEMA = {
    "name": "crestas_distribucion",
    "description": (
        "Compara como se DISTRIBUYE una misma magnitud entre varios sensores o arreglos: "
        "media, mediana y cuartiles de cada uno, y que probabilidad tiene cada uno de "
        "pasarse de un umbral. Usala cuando pregunten si dos sensores miden lo mismo, "
        "cual se va mas arriba, o cada cuanto una variable supera un valor (por ejemplo "
        "modulos por encima de 60 C). Todos los grupos tienen que compartir unidad."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "grupos": opciones.variables(
                "Las variables a comparar. Todas de la MISMA unidad."),
            **opciones.ventana(),
            "umbral": {
                "type": "number",
                "description": ("Valor a partir del cual se mide la probabilidad de cola "
                                "(en la unidad de las variables). Omitir = sin umbral."),
            },
            "cola": {
                "type": "string", "enum": list(crestas.COLAS),
                "description": (f"De que lado del umbral se mide la masa. Default "
                                f"'{crestas.SUPERIOR}' (por encima)."),
            },
        },
        "required": ["grupos"],
        "additionalProperties": False,
    },
}

# Las dos curvas de 200 puntos por grupo: son el dibujo de la cresta.
_DE_DIBUJO = ("densidad", "prob_cola")


def run(grupos: list[str], desde: str | None = None, hasta: str | None = None,
        umbral: float | None = None, cola: str = crestas.SUPERIOR) -> dict:
    v = ventana.crear(desde, hasta)
    completo = crestas.densidades(v, grupos, umbral, cola)
    return {
        **{k: valor for k, valor in completo.items() if k != "rejilla"},
        "grupos": [{k: valor for k, valor in grupo.items() if k not in _DE_DIBUJO}
                   for grupo in completo["grupos"]],
    }

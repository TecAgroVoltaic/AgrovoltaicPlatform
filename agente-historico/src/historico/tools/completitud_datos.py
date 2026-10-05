"""Tool `completitud_datos` — cuanto dato falta y DONDE estan los huecos (Fig. 4).

Delgada sobre `analitica.completitud.calcular`. Recorta dos cosas antes de
mandarle la respuesta al modelo: la serie por periodo (hasta 569 puntos por
fuente, que es un grafico y no una frase) y la lista completa de tramos sin datos.
De los tramos se mandan los mas LARGOS, que son los que explican el periodo: los
huecos de 126 y 71 dias de 2025 dicen todo, y los sueltos de un dia solo alargan
la respuesta.
"""
from __future__ import annotations

from historico.analitica import completitud, ventana
from historico.tools import opciones

# Cuantos tramos sin datos se le muestran al modelo. Tres alcanzan para nombrar los
# huecos grandes; el total exacto viaja aparte, asi que no se pierde la cuenta.
TRAMOS_MOSTRADOS = 3

SCHEMA = {
    "name": "completitud_datos",
    "description": (
        "Cuanto dato falta y DONDE: lecturas reales contra las que deberia haber a la "
        "cadencia real del periodo, dia por dia (o por semana o mes), y los TRAMOS sin "
        "datos con su fecha de inicio y fin, por separado para lo electrico y para la "
        "radiacion. Usala cuando pregunten cuanto falta, donde estan los huecos, desde "
        "cuando dejo de reportar algo o que tan completo esta un periodo. Si solo hace "
        "falta saber si hay datos y cuantas filas, `cobertura_datos` es mas barata."
    ),
    "input_schema": {
        "type": "object",
        "properties": opciones.ventana(con_granularidad=True),
        "additionalProperties": False,
    },
}


def _resumen_de(fuente: dict) -> dict:
    """El resumen de una fuente con los tramos sin datos recortados a los mayores."""
    tramos = sorted(fuente.get("tramos_sin_datos", []),
                    key=lambda t: t["dias"], reverse=True)
    return {**{k: v for k, v in fuente.items() if k != "tramos_sin_datos"},
            "tramos_sin_datos": tramos[:TRAMOS_MOSTRADOS],
            "tramos_sin_datos_total": len(tramos)}


def run(desde: str | None = None, hasta: str | None = None,
        granularidad: str | None = None) -> dict:
    v = ventana.crear(desde, hasta, granularidad)
    completo = completitud.calcular(v)
    return {
        **{k: valor for k, valor in completo.items() if k != "series"},
        "resumen": {fuente: _resumen_de(datos)
                    for fuente, datos in completo["resumen"].items()},
    }

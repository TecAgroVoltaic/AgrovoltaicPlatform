"""Tool `correlacion_variables` — cuanto explica una variable a la otra (Fig. 8).

Delgada sobre `analitica.correlacion.dispersion`. La nube trae hasta 2.000 pares
de coordenadas: al modelo no le dicen nada que no diga la recta, y son 4.000
numeros. Se le manda el AJUSTE (ecuacion, pendiente, intercepto, R2) y, sobre
todo, `pares` contra `lecturas_x`/`lecturas_y`: un R2 calculado sobre 300
coincidencias de 94.868 lecturas parece un resultado sobre todo el periodo y no
lo es. La nube completa viaja por `GET /analitica/correlacion`.
"""
from __future__ import annotations

from historico.analitica import correlacion, ventana
from historico.tools import opciones

SCHEMA = {
    "name": "correlacion_variables",
    "description": (
        "Si dos mediciones se mueven juntas y cuanto: la recta que mejor las relaciona "
        "(con su ecuacion) y el R2, que dice cuanto de una explica la otra. El caso "
        "tipico es irradiancia contra potencia. Usala cuando pregunten si algo depende "
        "de otra cosa, cuanta potencia da por unidad de irradiancia, o si dos sensores "
        "coinciden. Mira `pares`: los pares se forman por timestamp exacto y pueden ser "
        "muchos menos que las lecturas de cada lado."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "x": opciones.variable("Variable del eje X (la que explica)."),
            "y": opciones.variable("Variable del eje Y (la explicada)."),
            **opciones.ventana(),
        },
        "required": ["x", "y"],
        "additionalProperties": False,
    },
}

# Lo que se dibuja y no se lee: la nube adelgazada y sus banderas de dibujo.
_DE_DIBUJO = ("puntos", "puntos_mostrados", "submuestreado")


def run(x: str, y: str, desde: str | None = None, hasta: str | None = None) -> dict:
    v = ventana.crear(desde, hasta)
    completo = correlacion.dispersion(v, x, y)
    return {k: valor for k, valor in completo.items() if k not in _DE_DIBUJO}

"""Tool `serie_variable` — la evolucion de una o varias variables (Fig. 5), en texto.

Devuelve el RESUMEN de cada serie y no la serie punto a punto. Una ventana por
hora llega al techo de 1.500 buckets, y cada bucket trae ocho numeros (valor,
minimo, maximo, desviacion, las dos bandas, la media movil y la tendencia): son
doce mil numeros que el modelo no puede leer y que no le dicen nada que no diga
la pendiente. Los puntos completos viajan por `GET /analitica/series`, que es
quien dibuja. Es el mismo reparto que ya hacen `tendencia` y `graficar`.
"""
from __future__ import annotations

from historico.analitica import series, ventana
from historico.tools import opciones

SCHEMA = {
    "name": "serie_variable",
    "description": (
        "Como evoluciono una variable a lo largo del tiempo y si sube o baja: media, "
        "minimo y maximo del periodo, mas la RECTA DE TENDENCIA (pendiente por dia y "
        "R2). Acepta varias variables juntas para compararlas sobre el mismo eje. "
        "Usala cuando pregunten por la evolucion, la tendencia o el comportamiento de "
        "una medicion en el tiempo. No devuelve la serie punto a punto."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variables": opciones.variables(
                "Una o mas claves de variable del catalogo, para superponerlas."),
            **opciones.ventana(con_granularidad=True),
            "media_movil": {
                "type": "integer",
                "description": (f"Cuantos buckets promedia la media movil. "
                                f"Default {series.BUCKETS_MEDIA_MOVIL}."),
            },
        },
        "required": ["variables"],
        "additionalProperties": False,
    },
}


def _sin_puntos(serie: dict) -> dict:
    """La serie sin su array de buckets, diciendo cuantos habia."""
    puntos = serie.get("puntos", [])
    return {**{k: v for k, v in serie.items() if k != "puntos"},
            "buckets": len(puntos)}


def run(variables: str | list[str], desde: str | None = None,
        hasta: str | None = None, granularidad: str | None = None,
        media_movil: int = series.BUCKETS_MEDIA_MOVIL) -> dict:
    v = ventana.crear(desde, hasta, granularidad)
    completo = series.serie_temporal(v, variables, media_movil)
    return {
        **completo,
        "series": [_sin_puntos(s) for s in completo["series"]],
        "nota": ("resumen por serie, sin los puntos: la pendiente esta en unidad/dia y "
                 "el R2 dice que tan recta es esa evolucion (cerca de 0 = la recta no "
                 "describe nada). Los buckets sin dato NO se rellenan."),
    }

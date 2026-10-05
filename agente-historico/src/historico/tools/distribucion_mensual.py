"""Tool `distribucion_mensual` — como se reparte una variable mes a mes (Fig. 6).

Delgada sobre `analitica.distribucion.cajas_mensuales`. La caja de un mes son
catorce numeros y la ventana puede traer veinte meses: leidos en fila no dicen
nada, y el box plot completo ya viaja por `GET /analitica/distribucion` para
quien lo dibuja. Al modelo se le manda lo que si se puede afirmar en una frase:
en que mes la variable estuvo mas alta, en cual mas baja, y donde se concentran
los valores atipicos, que es lo que manda a revisar un sensor.
"""
from __future__ import annotations

from historico.analitica import distribucion, ventana
from historico.tools import opciones

# Cuantos meses se nombran por outliers. Mas de tres deja de ser una pista y pasa
# a ser la tabla entera, que es justo lo que este recorte evita.
MESES_MOSTRADOS = 3

SCHEMA = {
    "name": "distribucion_mensual",
    "description": (
        "Como se REPARTEN los valores de una variable mes a mes: en que mes estuvo mas "
        "alta y en cual mas baja (por mediana), y en que meses hay mas valores atipicos "
        "(criterio IQR, el que delata un sensor raro). Usala cuando pregunten por la "
        "distribucion, la variacion mensual, la estacionalidad de una medicion o si hay "
        "valores anomalos. No devuelve el box plot completo."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": opciones.variable("Clave de la variable del catalogo."),
            **opciones.ventana(),
        },
        "required": ["variable"],
        "additionalProperties": False,
    },
}


def _extremo(cajas: list[dict], campo: str, mayor: bool) -> dict | None:
    """El mes con la mediana mas alta o mas baja. None si ningun mes tiene dato."""
    con_dato = [c for c in cajas if c.get(campo) is not None]
    if not con_dato:
        return None
    elegido = (max if mayor else min)(con_dato, key=lambda c: c[campo])
    return {"mes": elegido["mes"], "valor": elegido[campo], "n": elegido["n"]}


def _outliers(cajas: list[dict]) -> dict:
    """El total de atipicos y los meses que mas concentran."""
    def cuantos(caja: dict) -> int:
        return caja["outliers_bajos"] + caja["outliers_altos"]

    con_outliers = sorted((c for c in cajas if cuantos(c)), key=cuantos, reverse=True)
    return {
        "bajos": sum(c["outliers_bajos"] for c in cajas),
        "altos": sum(c["outliers_altos"] for c in cajas),
        "meses_con_mas": [{"mes": c["mes"], "outliers": cuantos(c), "n": c["n"]}
                          for c in con_outliers[:MESES_MOSTRADOS]],
    }


def resumir(cajas: list[dict]) -> dict:
    """Lo que se puede decir en una frase sobre veinte cajas. Puro, sin base."""
    con_datos = [c for c in cajas if c["n"]]
    return {
        "meses": {"total": len(cajas), "con_datos": len(con_datos),
                  "sin_datos": len(cajas) - len(con_datos)},
        "lecturas": sum(c["n"] for c in cajas),
        "mediana_mas_alta": _extremo(cajas, "mediana", mayor=True),
        "mediana_mas_baja": _extremo(cajas, "mediana", mayor=False),
        "outliers": _outliers(cajas),
    }


def run(variable: str, desde: str | None = None, hasta: str | None = None) -> dict:
    v = ventana.crear(desde, hasta)
    completo = distribucion.cajas_mensuales(v, variable)
    return {
        **{k: valor for k, valor in completo.items() if k != "cajas"},
        **resumir(completo["cajas"]),
        "nota": ("resumen de las cajas mensuales (sin los cuartiles mes por mes). Un mes "
                 "con n = 0 no midio cero: no se registro. Los outliers son el criterio "
                 "IQR del documento, no necesariamente errores."),
    }

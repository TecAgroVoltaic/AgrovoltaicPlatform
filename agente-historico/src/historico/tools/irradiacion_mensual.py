"""Tool `irradiacion_mensual` — cuanta radiacion entro cada mes (Fig. 6, barras).

Delgada sobre `analitica.distribucion.irradiacion_mensual`. Del array de barras
se le manda al modelo el total del periodo y los dos meses extremos: la barra mes
a mes es un grafico, y viaja por `GET /analitica/irradiacion`.
"""
from __future__ import annotations

from historico.analitica import distribucion, ventana
from historico.tools import opciones

SCHEMA = {
    "name": "irradiacion_mensual",
    "description": (
        "Cuanta ENERGIA SOLAR entro por metro cuadrado en el periodo (kWh/m2), mes a "
        "mes: el total, el mes de mas sol y el de menos, con la media diaria de cada "
        "uno. Es la integral de la irradiancia, no su promedio. Usala cuando pregunten "
        "cuanto sol hubo, cuanta radiacion acumulada entro o que mes fue el mejor. "
        "Para el valor instantaneo tipico usa `serie_variable`."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": opciones.variable(
                f"Que irradiancia integrar. Default "
                f"'{distribucion.IRRADIANCIA_POR_DEFECTO}'.",
                unidad=distribucion.UNIDAD_IRRADIANCIA),
            **opciones.ventana(),
        },
        "additionalProperties": False,
    },
}


def _extremo(barras: list[dict], mayor: bool) -> dict | None:
    """El mes con mas (o menos) irradiacion acumulada. None si ninguno tiene dato."""
    con_dato = [b for b in barras if b["irradiacion"]["valor"] is not None]
    if not con_dato:
        return None
    elegido = (max if mayor else min)(con_dato, key=lambda b: b["irradiacion"]["valor"])
    return {"mes": elegido["mes"], "irradiacion": elegido["irradiacion"],
            "media_diaria": elegido["media_diaria"],
            "dias_con_dato": elegido["dias_con_dato"]}


def run(variable: str = distribucion.IRRADIANCIA_POR_DEFECTO,
        desde: str | None = None, hasta: str | None = None) -> dict:
    v = ventana.crear(desde, hasta)
    completo = distribucion.irradiacion_mensual(v, variable)
    barras = completo["barras"]
    con_dato = [b for b in barras if b["irradiacion"]["valor"] is not None]
    return {
        **{k: valor for k, valor in completo.items() if k != "barras"},
        "meses": {"total": len(barras), "con_datos": len(con_dato)},
        "mes_de_mas_sol": _extremo(barras, mayor=True),
        "mes_de_menos_sol": _extremo(barras, mayor=False),
        "nota": ("total e integral por mes (sin la barra mes a mes). La media diaria se "
                 "divide por los dias CON DATO, no por los del mes: un mes con seis dias "
                 "registrados no fue un mes oscuro, fue un mes casi sin medir."),
    }

"""Tool `comparativa_arreglos` — inclinado contra vertical (eje 1 del documento).

Delgada sobre `analitica.comparativa.arreglos`. Se le quitan los dos arrays que
son grafico y no lectura: la serie por periodo y la curva hora a hora. Lo que si
va es `separacion_horaria`, que ya viene resumida por el algoritmo con la franja
en que gana cada arreglo, porque esa franja ES la respuesta del eje 1: el vertical
no compite al mediodia y puede ganar en las puntas del dia.
"""
from __future__ import annotations

from historico.analitica import comparativa, ventana
from historico.tools import opciones

SCHEMA = {
    "name": "comparativa_arreglos",
    "description": (
        "Compara el arreglo INCLINADO (PV1, 20 grados) contra el VERTICAL (PV2, 90 "
        "grados), que tienen la misma potencia instalada: cuanta energia genero cada "
        "uno, cual gano y por cuanto, en que horas del dia le gana cada uno al otro, y "
        "el performance ratio de ambos. Usala cuando pregunten cual arreglo rinde mejor, "
        "si conviene la vertical, o por la diferencia entre las dos configuraciones. El "
        "PR que devuelve es el DIARIO Y MENSUAL, el mismo numero exacto que da "
        "`performance_ratio`: no son dos cuentas distintas y no hay que contrastarlas."
    ),
    "input_schema": {
        "type": "object",
        "properties": opciones.ventana(con_granularidad=True),
        "additionalProperties": False,
    },
}

# Los dos arrays de dibujo: la serie por periodo y las 24 filas de la curva.
_DE_DIBUJO = ("por_periodo", "curva_horaria")

_RECORTE = (" Esta respuesta trae los totales y la lectura horaria, no la serie por "
            "periodo ni la curva hora a hora: esas se piden por la API.")


def _estacionalidad(bloque: dict) -> dict:
    """La estacionalidad sin la tabla mes a mes: cuantos meses entraron y por que."""
    return {**{k: v for k, v in bloque.items() if k not in ("meses", "descartados")},
            "meses_comparables": len(bloque["meses"]),
            "meses_descartados": len(bloque["descartados"])}


def run(desde: str | None = None, hasta: str | None = None,
        granularidad: str | None = None) -> dict:
    v = ventana.crear(desde, hasta, granularidad)
    completo = comparativa.arreglos(v)
    return {
        **{k: valor for k, valor in completo.items() if k not in _DE_DIBUJO},
        "estacionalidad": _estacionalidad(completo["estacionalidad"]),
        "nota": completo["nota"] + _RECORTE,
    }

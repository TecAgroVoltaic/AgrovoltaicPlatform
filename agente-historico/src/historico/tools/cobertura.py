"""Tool `cobertura_datos` — los TOTALES rapidos: rango disponible y conteo de filas.

Responde "de cuando a cuando hay datos" y "cuantas filas hay" en el periodo pedido,
con dos conteos y nada mas. Es la pregunta previa a cualquier analisis: si el
periodo esta vacio no hace falta seguir.

NO confundir con `completitud_datos`, que es su vecina cara y responde otra cosa:
esta cuenta filas y no sabe cuantas DEBERIA haber; aquella mide lo real contra lo
esperado a la cadencia del periodo, periodo por periodo, y devuelve los tramos sin
datos con fecha de inicio y fin. Se separan porque el 90% de las preguntas solo
necesitan saber si hay algo, y esa respuesta tiene que costar dos conteos.
"""
from __future__ import annotations

from historico import db
from historico.periodo import rango

SCHEMA = {
    "name": "cobertura_datos",
    "description": (
        "Totales rapidos de datos: entre que fechas hay historico y cuantas filas cayeron "
        "en el periodo (electrico y radiacion). Una sola cuenta, sin serie ni huecos. "
        "Usala para saber SI hay datos antes de pedir un analisis. Si preguntan cuanto "
        "dato FALTA, donde estan los huecos o desde cuando dejo de reportar algo, la que "
        "responde eso es `completitud_datos`. Omiti desde/hasta para todo el historico."
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
    disponible = db.uno(
        """
        SELECT min(timestamp) AS disponible_desde, max(timestamp) AS disponible_hasta
        FROM monitoreo_sc_electrico
        """
    )
    conteo = db.uno(
        """
        SELECT
          (SELECT count(*) FROM monitoreo_sc_electrico
             WHERE timestamp >= %s AND timestamp < %s) AS filas_electrico_5min,
          (SELECT count(*) FROM radiacion_sc_15s
             WHERE timestamp >= %s AND timestamp < %s) AS filas_radiacion_15s
        """,
        (d, h, d, h),
    )
    return {
        "periodo": {"desde": d, "hasta": h},
        **disponible,
        **conteo,
        "nota": "los datos son historicos (no en vivo); hay gaps largos (ene-abr y jul-ago 2025)",
    }

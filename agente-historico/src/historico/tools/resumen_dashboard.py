"""Tool `resumen_dashboard` — los 9 KPIs de cabecera del documento (Fig. 2).

Capa delgada sobre `analitica.resumen.calcular`: parsea la ventana, llama y
devuelve. Toda la respuesta son escalares (energias, rendimientos, frescura del
dato), asi que no hay nada que recortar antes de mandarsela al modelo.
"""
from __future__ import annotations

from historico.analitica import resumen, ventana
from historico.tools import opciones

SCHEMA = {
    "name": "resumen_dashboard",
    "description": (
        "El panorama del sistema en un periodo, de un vistazo: cuando fue la ultima "
        "lectura y si el sistema sigue reportando, cuanta energia genero cada arreglo "
        "(PV1 inclinado y PV2 vertical), cuanto en los ultimos 7 dias CON DATOS, y el "
        "rendimiento especifico (kWh/kWp) de cada uno. Usala cuando pregunten 'como va "
        "el sistema', 'resumen', 'cuanto lleva generado' o por el estado general. "
        "OJO con dos campos parecidos que NO son lo mismo: `actualizacion` es la "
        "frescura del SISTEMA, medida sobre toda la base, y es la unica que puede decir "
        "que la planta dejo de reportar; `ultimo_dato_del_periodo` es solo hasta donde "
        "llega el rango pedido y jamas significa una averia. "
        "Omiti desde/hasta para todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": opciones.ventana(),
        "additionalProperties": False,
    },
}


def run(desde: str | None = None, hasta: str | None = None) -> dict:
    return resumen.calcular(ventana.crear(desde, hasta))

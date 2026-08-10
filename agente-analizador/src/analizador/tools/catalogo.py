"""Tool `catalogo_variables` — que significa cada variable/columna de los datos.

Lee la tabla diccionario_variables (definiciones aprobadas por el equipo). Sin
parametros: devuelve el catalogo completo para que el agente explique una columna.
"""
from __future__ import annotations

from analizador import db

SCHEMA = {
    "name": "catalogo_variables",
    "description": (
        "Diccionario de las variables medidas (nombre, descripcion, a que tabla "
        "pertenece: electrico o radiacion). Usalo si preguntan que significa una "
        "columna/variable o que se mide."
    ),
    "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
}


def run() -> dict:
    filas = db.query(
        "SELECT variable, descripcion, tabla FROM diccionario_variables ORDER BY tabla, variable"
    )
    return {"n": len(filas), "variables": filas}

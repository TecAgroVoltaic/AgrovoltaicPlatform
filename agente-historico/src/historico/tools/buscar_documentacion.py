"""Tool `buscar_documentacion` — preguntas sobre el proyecto respondidas con sus docs.

Contrato §4.4 y §6 (`docs/referencia/contratos-asistente-plataforma.md`). Busca
en la copia de `docs/memoria`, `docs/referencia` y `docs/conceptos` (ver
`historico.conocimiento`). Al LLM le llegan extractos de hasta 600 caracteres con
su ruta y seccion; al frontend, `_documentos` para pintar las referencias como
chips (la documentacion no se sirve en la consola). Sin copia de los docs
responde "documentacion no disponible", nunca una excepcion.
"""
from __future__ import annotations

from historico import conocimiento

VERSION = 1
MAX_RESULTADOS = 5
_NOTA = ("Respondé con lo que dicen los extractos y citá el documento por su título. "
         "Si no alcanzan, decilo; no completes con suposiciones.")
_NOTA_VACIA = "Nada en la documentación coincide: decilo y pedí otra formulación."

SCHEMA = {
    "name": "buscar_documentacion",
    "description": (
        "Busca en la documentacion del proyecto (memoria, decisiones, inconsistencias "
        "de los datos, referencia y glosario) y devuelve extractos cortos con su "
        "documento y seccion. Usala para preguntas sobre COMO o POR QUE: como se "
        "calcula una metrica, que se decidio, que significa un codigo o un problema "
        "conocido del dato, que es cada fuente o caja. No trae datos medidos."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "consulta": {"type": "string",
                         "description": "La pregunta o las palabras clave a buscar."},
            "max": {"type": "integer", "minimum": 1, "maximum": MAX_RESULTADOS,
                    "description": f"Cuantos extractos devolver (1-{MAX_RESULTADOS}). "
                                   f"Default {MAX_RESULTADOS}."},
        },
        "required": ["consulta"],
        "additionalProperties": False,
    },
}


def _maximo(valor: int | None) -> int:
    try:
        return min(MAX_RESULTADOS, max(1, int(valor if valor is not None else MAX_RESULTADOS)))
    except (TypeError, ValueError):
        return MAX_RESULTADOS


def run(consulta: str, max: int | None = MAX_RESULTADOS) -> dict:  # noqa: A002 (nombre del contrato)
    resultados = conocimiento.buscar(consulta, _maximo(max))
    if resultados is None:
        return {"consulta": consulta, "resultados": [], "nota": conocimiento.NO_DISPONIBLE}
    if not resultados:
        return {"consulta": consulta, "resultados": [], "nota": _NOTA_VACIA}
    extractos = [{"documento": r["titulo"], "ruta": r["ruta"], "seccion": r["seccion"],
                  "extracto": r["extracto"]} for r in resultados]
    documentos = {
        "version": VERSION,
        "documentos": [{"titulo": r["titulo"], "ruta": r["ruta"], "seccion": r["seccion"]}
                       for r in resultados],
    }
    return {"consulta": consulta, "resultados": extractos, "_documentos": documentos,
            "nota": _NOTA}

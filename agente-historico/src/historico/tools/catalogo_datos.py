"""Tool `catalogo_datos` — «¿qué datos hay?» en las cuatro fuentes (contrato §6).

Devuelve un resumen CORTO para el modelo (ids y etiquetas, recortado) y en
`_selector_variables` (§4.2) los grupos completos para que la interfaz dibuje los
chips. Elegir es del usuario: «Armar archivo» vuelve como mensaje de texto.
"""
from __future__ import annotations

from historico import catalogo_datos

VERSION = 1
MAX_VARIABLES_RESUMEN = 40
_NOTA = ("La interfaz muestra un selector con estas variables. Contale en una o dos frases "
         "que hay y pedile que elija; no listes todo.")

SCHEMA = {
    "name": "catalogo_datos",
    "description": (
        "Lista las VARIABLES disponibles en las cuatro fuentes (Supabase PV San Carlos, store "
        "ambiental, AgroDash San Carlos y AgroDash Cartago) con su id '<fuente>:<clave>', "
        "unidad y cobertura, y muestra al usuario un selector para elegirlas. Usala cuando "
        "pregunten que datos hay o quieran armar un archivo y no hayan dicho las variables. "
        "Los ids que devuelve son los que acepta `plan_exportacion`."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "consulta": {"type": "string",
                         "description": "Texto para filtrar (p. ej. 'humedad', 'potencia'). Omitir = todo."},
            "fuentes": {"type": "array", "items": {"type": "string", "enum": list(catalogo_datos.FUENTES)},
                        "description": "Limitar a estas fuentes. Omitir = las cuatro."},
        },
        "additionalProperties": False,
    },
}


def _linea(v: dict) -> str:
    unidad = f" [{v['unidad']}]" if v.get("unidad") else ""
    tramo = f" {v['desde'] or '…'}→{v['hasta'] or '…'}" if (v.get("desde") or v.get("hasta")) else ""
    return f"{v['id']}: {v['etiqueta']}{unidad}{tramo}"


def run(consulta: str | None = None, fuentes: list[str] | None = None) -> dict:
    grupos = catalogo_datos.catalogo(consulta, fuentes)["grupos"]
    total = sum(len(g["variables"]) for g in grupos)
    lineas: list[str] = []
    for g in grupos:
        for v in g["variables"]:
            if len(lineas) < MAX_VARIABLES_RESUMEN:
                lineas.append(_linea(v))
    resumen = {
        "total_variables": total,
        "grupos": [{"fuente": g["fuente"], "grupo": g["etiqueta"], "variables": len(g["variables"])}
                   for g in grupos],
        "variables": lineas,
        "recortado": total > len(lineas),
    }
    selector = {"version": VERSION,
                "titulo": f"Datos: {consulta.strip()}" if consulta and consulta.strip() else "Datos disponibles",
                "preseleccion": [], "grupos": grupos}
    return {"resumen": resumen, "_selector_variables": selector, "nota": _NOTA}

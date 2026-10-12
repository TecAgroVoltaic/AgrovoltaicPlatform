"""Tool `plan_exportacion` — archivos combinados o separados de varias fuentes (§3, §4.1).

No genera nada: valida el plan, estima filas y devuelve en `_descargas` las URLs de
`GET /datos/exportar/plan` (relativas). El navegador baja con el boton; con mas de
100.000 filas la tarjeta pide confirmacion antes.

`hasta` es INCLUSIVO en esta tool (a diferencia del resto): es el campo del
PlanExportacion tal cual lo define el contrato, y viaja igual en la URL.
"""
from __future__ import annotations

from historico import plan as plan_mod

VERSION = 1
_NOTA = ("La interfaz muestra la tarjeta de descarga. Resumi que contiene cada archivo y el "
         "total de filas; si requiere_confirmacion es true, avisale que tiene que confirmar.")

_COLUMNA = {"type": "object", "properties": {
    "variable": {"type": "string", "description": "Id '<fuente>:<clave>' de catalogo_datos."},
    "agregacion": {"type": "string", "enum": list(plan_mod.AGREGACIONES),
                   "description": "Default 'promedio'. AgroDash no admite 'ultimo'."},
    "alias": {"type": "string", "description": "Nombre de columna opcional."},
}, "required": ["variable"], "additionalProperties": False}

SCHEMA = {
    "name": "plan_exportacion",
    "description": (
        "Prepara la DESCARGA de uno o varios archivos que combinan variables de cualquier "
        "fuente, remuestreadas a un intervalo comun. Usala despues de acordar variables, "
        "rango e intervalo (si el usuario no dijo intervalo, PREGUNTA y propone uno). "
        "'ancho' = fecha_hora + una columna por variable (exige paso_s > 0); 'largo' = "
        "fecha_hora, fuente, variable, caja, valor, unidad (unica opcion en crudo). Un "
        "archivo 'junto' = un archivo con todas las columnas; 'por fuente' = un archivo "
        "por fuente. Fechas YYYY-MM-DD en hora local; `hasta` es INCLUSIVO en esta tool."
    ),
    "input_schema": {"type": "object", "properties": {"plan": {
        "type": "object", "description": "PlanExportacion v1: rango, intervalo y archivos.",
        "properties": {
            "desde": {"type": "string", "description": "Primer dia, inclusivo."},
            "hasta": {"type": "string", "description": "Ultimo dia, INCLUSIVO."},
            "paso_s": {"type": "integer", "enum": list(plan_mod.PASOS_S),
                       "description": "Intervalo en segundos; 0 = crudo (solo forma 'largo')."},
            "archivos": {"type": "array", "maxItems": plan_mod.MAX_ARCHIVOS, "items": {
                "type": "object", "properties": {
                    "nombre": {"type": "string", "description": "Sin extension; opcional."},
                    "formato": {"type": "string", "enum": list(plan_mod.FORMATOS)},
                    "forma": {"type": "string", "enum": list(plan_mod.FORMAS)},
                    "columnas": {"type": "array", "maxItems": plan_mod.MAX_COLUMNAS, "items": _COLUMNA},
                }, "required": ["formato", "forma", "columnas"]}},
        }, "required": ["desde", "hasta", "paso_s", "archivos"]}},
        "required": ["plan"], "additionalProperties": False},
}


def _normalizado(plan: dict) -> dict:
    return {"version": plan_mod.VERSION, **{k: v for k, v in plan.items() if k != "version"}}


def descargas(plan: dict) -> dict:
    """La DescargasSpec v1 del plan (valida y estima; levanta PlanInvalido)."""
    original = _normalizado(plan)
    p = plan_mod.codificar(original)
    validado = plan_mod.validar(original)
    est = plan_mod.estimar(validado)
    archivos = [{"indice": a.indice, "nombre": a.nombre_completo, "formato": a.formato,
                 "forma": a.forma, "filas_estimadas": e["filas"],
                 "columnas": [{k: c[k] for k in ("nombre", "variable", "etiqueta", "fuente", "unidad")}
                              for c in e["columnas"]],
                 "fuentes": a.fuentes, "url": plan_mod.url_archivo(p, a.indice)}
                for a, e in zip(validado.archivos, est["archivos"])]
    return {"version": VERSION, "plan": original, "archivos": archivos,
            "zip_url": plan_mod.url_zip(p) if len(archivos) > 1 else None,
            "total_filas": est["total_filas"], "requiere_confirmacion": est["requiere_confirmacion"]}


def run(plan: dict) -> dict:
    try:
        spec = descargas(plan)
    except plan_mod.PlanInvalido as exc:
        raise ValueError(f"{exc.codigo}: {exc}") from None
    resumen = {"archivos": [{"nombre": a["nombre"], "filas": a["filas_estimadas"],
                             "columnas": [c["nombre"] for c in a["columnas"]], "fuentes": a["fuentes"]}
                            for a in spec["archivos"]],
               "total_filas": spec["total_filas"], "requiere_confirmacion": spec["requiere_confirmacion"],
               "zip": spec["zip_url"] is not None}
    return {"resumen": resumen, "_descargas": spec, "nota": _NOTA}

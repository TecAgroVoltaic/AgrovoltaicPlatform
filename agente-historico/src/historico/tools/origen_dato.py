"""Tool `origen_dato` — «¿de dónde sale este dato?» (contrato §6).

Fuente, tabla (o endpoint de la API), columna o tipo de sensor, cadencia, cobertura
y reloj de UNA variable del catalogo unificado.
"""
from __future__ import annotations

from historico import catalogo_datos
from historico.fuentes.catalogo import (
    AGRODASH_CARTAGO, AGRODASH_SC, METADATOS, SUPABASE_AMBIENTAL, SUPABASE_PV,
)

_LOCAL_API = "hora local de Costa Rica sin zona (la API ya convierte)"
_RELOJ = {
    SUPABASE_PV: "hora local de Costa Rica, guardada con etiqueta +00 espuria (no es UTC)",
    SUPABASE_AMBIENTAL: "UTC real; se convierte a hora local de Costa Rica al exportar",
    AGRODASH_SC: _LOCAL_API, AGRODASH_CARTAGO: _LOCAL_API,
}

SCHEMA = {
    "name": "origen_dato",
    "description": (
        "Dice DE DONDE SALE una variable: fuente, tabla o API, columna o tipo de sensor, "
        "cadencia nativa, cobertura (primer y ultimo dia) y convencion de reloj. Usala "
        "cuando pregunten de donde viene un dato o por que no hay datos en un rango."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": {"type": "string",
                         "description": "Id '<fuente>:<clave>' de catalogo_datos (una clave sola se "
                                        "busca en supabase_pv)."},
        },
        "required": ["variable"],
        "additionalProperties": False,
    },
}


def _donde(v: catalogo_datos.VariableDatos) -> dict:
    if v.via_api:
        return {"tabla": "API pública de AgroDash (/readings)", "sensor_tipo": v.sensor_tipo,
                "cajas": list(v.cajas)}
    salida = {"tabla": v.relacion, "columna": v.columna}
    if v.variable_store:
        salida.update(filtro=f"variable = '{v.variable_store}'", cajas=list(v.cajas))
    if v.filtro.strip():
        salida["filtro_calidad"] = v.filtro.strip().removeprefix("AND ").strip()
    return salida


def run(variable: str) -> dict:
    id_variable = variable if ":" in variable else f"{SUPABASE_PV}:{variable}"
    v = catalogo_datos.resolver(id_variable)
    meta = METADATOS[v.fuente]
    return {
        "variable": v.id, "etiqueta": v.etiqueta, "unidad": v.unidad,
        "fuente": {"id": v.fuente, "nombre": meta["nombre"], "acceso": meta["acceso"],
                   "region": meta["region"]},
        **_donde(v),
        "cadencia_s": v.cadencia_s,
        "cobertura": {"desde": v.desde, "hasta": v.hasta},
        "reloj": _RELOJ[v.fuente],
        "nota": v.nota,
    }

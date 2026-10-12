"""Variables del store ambiental (`lecturas_ambientales_sc`): una por `variable`.

El store es formato largo (caja, variable, valor, unidad) con reloj UTC REAL. Una
variable del catalogo junta todas las cajas y sensores que la miden; en formato
largo cada caja sale aparte.
"""
from __future__ import annotations

from historico.catalogo_datos.etiquetas import humanizar
from historico.catalogo_datos.modelo import VariableDatos
from historico.fuentes.catalogo import SUPABASE_AMBIENTAL
from historico.fuentes.supabase import RELACION_AMBIENTAL

_ETIQUETAS = {
    "humedad_suelo": "Humedad del suelo",
    "irradiancia": "Irradiancia (caja SC)",
    "humedad_aire": "Humedad del aire",
    "temperatura": "Temperatura del aire",
}
_UNIDADES_CRUDAS = {"adc", "crudo"}
_NOTA_CRUDA = "valor crudo del sensor, sin calibrar"
GRUPO = ("store", "Store ambiental San Carlos")


def variables(series: list[dict]) -> list[VariableDatos]:
    """`series`: filas (caja, variable, unidad, desde, hasta, n) de `fuentes.supabase`."""
    por_variable: dict[str, dict] = {}
    for s in series:
        acc = por_variable.setdefault(s["variable"], {"unidades": set(), "desde": [], "hasta": [],
                                                       "cajas": set()})
        acc["unidades"].add(s.get("unidad") or "")
        acc["cajas"].add(s.get("caja"))
        if s.get("desde"):
            acc["desde"].append(s["desde"])
        if s.get("hasta"):
            acc["hasta"].append(s["hasta"])
    out = []
    for nombre, acc in sorted(por_variable.items()):
        unidades = sorted(u for u in acc["unidades"] if u)
        unidad = "/".join(unidades) or None
        nota = _NOTA_CRUDA if set(unidades) & _UNIDADES_CRUDAS else None
        out.append(VariableDatos(
            fuente=SUPABASE_AMBIENTAL, clave=nombre, grupo=GRUPO[0], grupo_etiqueta=GRUPO[1],
            etiqueta=_ETIQUETAS.get(nombre) or humanizar(nombre), unidad=unidad,
            desde=min(acc["desde"], default=None), hasta=max(acc["hasta"], default=None),
            cadencia_s=None, nota=nota,
            relacion=RELACION_AMBIENTAL, columna="valor", variable_store=nombre,
            cajas=tuple(sorted(c for c in acc["cajas"] if c)), reloj="utc", tcol="ts",
        ))
    return out

"""De JSON a `Plan`: se valida TODO antes de emitir un solo byte (contrato §3)."""
from __future__ import annotations

import re
from datetime import date

from historico.catalogo_datos import VariableDatos, variables
from historico.plan.columnas import columnas
from historico.plan.modelo import (
    ANCHO, FORMAS, FORMATOS, MAX_ARCHIVOS, PASOS_S, VERSION, ArchivoPlan, Plan, PlanInvalido,
)

_NO_NOMBRE = re.compile(r"[^0-9A-Za-z_-]+")
MAX_NOMBRE_ARCHIVO = 80
_ETIQUETA_PASO = {0: "crudo", 60: "1min", 300: "5min", 900: "15min", 3600: "1h", 86400: "1d"}


def _fecha(valor, nombre: str) -> date:
    try:
        return date.fromisoformat(str(valor))
    except (TypeError, ValueError):
        raise PlanInvalido("fecha_ilegible", f"'{nombre}' tiene que ser una fecha YYYY-MM-DD: {valor!r}") from None


def _paso(valor) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int) or valor not in PASOS_S:
        raise PlanInvalido("paso_invalido",
                           f"paso_s {valor!r} invalido (validos: {', '.join(map(str, PASOS_S))})")
    return valor


def _nombre(crudo, cols, plan_desde: date, plan_hasta: date, paso_s: int, usados: set[str]) -> str:
    if crudo:
        base = _NO_NOMBRE.sub("_", str(crudo)).strip("_-")[:MAX_NOMBRE_ARCHIVO]
    else:
        fuentes = "-".join(dict.fromkeys(c.variable.fuente for c in cols))
        base = f"{fuentes}_{plan_desde}_{plan_hasta}_{_ETIQUETA_PASO[paso_s]}"
    base = base or "datos"
    nombre, k = base, 2
    while nombre in usados:
        nombre = f"{base}_{k}"
        k += 1
    usados.add(nombre)
    return nombre


def _archivo(crudo, i: int, catalogo: list[VariableDatos], desde: date, hasta: date,
             paso_s: int, usados: set[str]) -> ArchivoPlan:
    if not isinstance(crudo, dict):
        raise PlanInvalido("plan_ilegible", f"archivo {i}: tiene que ser un objeto")
    formato = crudo.get("formato") or "csv"
    if formato not in FORMATOS:
        raise PlanInvalido("formato_invalido", f"archivo {i}: formato {formato!r} (validos: {', '.join(FORMATOS)})")
    forma = crudo.get("forma") or ANCHO
    if forma not in FORMAS:
        raise PlanInvalido("forma_invalida", f"archivo {i}: forma {forma!r} (validas: {', '.join(FORMAS)})")
    if forma == ANCHO and not paso_s:
        raise PlanInvalido("rejilla_requerida",
                           f"archivo {i}: la forma 'ancho' necesita paso_s > 0 (en crudo no hay "
                           f"rejilla comun); usa forma 'largo' o un intervalo")
    cols = columnas(crudo.get("columnas"), catalogo, desde, hasta, paso_s, i)
    return ArchivoPlan(i, _nombre(crudo.get("nombre"), cols, desde, hasta, paso_s, usados),
                       formato, forma, cols)


def validar(plan: dict, catalogo: list[VariableDatos] | None = None) -> Plan:
    """El `Plan` listo para estimar o emitir, o `PlanInvalido` con su `codigo`."""
    if not isinstance(plan, dict):
        raise PlanInvalido("plan_ilegible", "el plan tiene que ser un objeto JSON")
    if plan.get("version", VERSION) != VERSION:
        raise PlanInvalido("version_no_soportada", f"version {plan.get('version')!r}; solo existe la {VERSION}")
    desde, hasta = _fecha(plan.get("desde"), "desde"), _fecha(plan.get("hasta"), "hasta")
    if hasta < desde:
        raise PlanInvalido("rango_vacio", f"'hasta' ({hasta}) es anterior a 'desde' ({desde})")
    paso_s = _paso(plan.get("paso_s"))
    archivos = plan.get("archivos")
    if not isinstance(archivos, list) or not archivos:
        raise PlanInvalido("sin_archivos", "el plan necesita al menos un archivo")
    if len(archivos) > MAX_ARCHIVOS:
        raise PlanInvalido("demasiados_archivos", f"{len(archivos)} archivos y el tope es {MAX_ARCHIVOS}")
    cat = catalogo if catalogo is not None else variables()
    usados: set[str] = set()
    return Plan(desde, hasta, paso_s,
                tuple(_archivo(a, i, cat, desde, hasta, paso_s, usados) for i, a in enumerate(archivos)),
                plan)

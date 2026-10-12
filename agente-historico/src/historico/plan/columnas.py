"""Validacion de las columnas de un archivo: variable, agregacion, nombre y cobertura."""
from __future__ import annotations

import re
from datetime import date

from historico.catalogo_datos import PREFIJO, VariableDatos, VariableNoCatalogada, resolver
from historico.plan.modelo import (
    AGREGACIONES, COLUMNA_TIEMPO, MAX_COLUMNAS, PROMEDIO, ULTIMO, ColumnaPlan, PlanInvalido,
)

_NO_IDENT = re.compile(r"[^0-9A-Za-z_]+")
MAX_NOMBRE_COLUMNA = 63          # el tope de un identificador MATLAB


def nombre_columna(texto: str) -> str:
    """Nombre seguro para csv/dat/mat: letras, digitos y '_'."""
    return _NO_IDENT.sub("_", texto).strip("_")[:MAX_NOMBRE_COLUMNA] or "columna"


def _variable(id_variable, catalogo: list[VariableDatos], i: int) -> VariableDatos:
    if not isinstance(id_variable, str):
        raise PlanInvalido("variable_desconocida", f"archivo {i}: cada columna necesita 'variable'")
    try:
        return resolver(id_variable, catalogo)
    except VariableNoCatalogada as exc:
        raise PlanInvalido("variable_desconocida", f"archivo {i}: {exc}") from None


def _cobertura(v: VariableDatos, desde: date, hasta: date, i: int) -> None:
    """Rechaza solo si el rango NO TOCA el tramo de la variable (solapar alcanza)."""
    if v.hasta and desde.isoformat() > v.hasta:
        raise PlanInvalido("fuera_de_cobertura",
                           f"archivo {i}: {v.etiqueta} ({v.id}) tiene datos hasta el {v.hasta} "
                           f"y el rango empieza el {desde}")
    if v.desde and hasta.isoformat() < v.desde:
        raise PlanInvalido("fuera_de_cobertura",
                           f"archivo {i}: {v.etiqueta} ({v.id}) tiene datos desde el {v.desde} "
                           f"y el rango termina el {hasta}")


def _agregacion(valor, v: VariableDatos, paso_s: int, i: int) -> str:
    agg = valor or PROMEDIO
    if agg not in AGREGACIONES:
        raise PlanInvalido("agregacion_invalida",
                           f"archivo {i}: agregacion {agg!r} (validas: {', '.join(AGREGACIONES)})")
    if agg == ULTIMO and v.via_api and paso_s:
        # La API de AgroDash solo devuelve promedio, n, min y max por intervalo.
        raise PlanInvalido("agregacion_no_admitida",
                           f"archivo {i}: AgroDash no informa el ultimo valor del intervalo "
                           f"({v.id}); usa promedio, min, max o suma")
    return agg


def columnas(crudas, catalogo: list[VariableDatos], desde: date, hasta: date,
             paso_s: int, i: int) -> tuple[ColumnaPlan, ...]:
    """Las columnas del archivo `i`, validadas y en el orden pedido."""
    if not isinstance(crudas, list) or not crudas:
        raise PlanInvalido("sin_columnas", f"archivo {i}: hace falta al menos una columna")
    if len(crudas) > MAX_COLUMNAS:
        raise PlanInvalido("demasiadas_columnas",
                           f"archivo {i}: {len(crudas)} columnas y el tope es {MAX_COLUMNAS}")
    out: list[ColumnaPlan] = []
    for c in crudas:
        if not isinstance(c, dict):
            raise PlanInvalido("plan_ilegible", f"archivo {i}: cada columna es un objeto")
        v = _variable(c.get("variable"), catalogo, i)
        _cobertura(v, desde, hasta, i)
        agg = _agregacion(c.get("agregacion"), v, paso_s, i)
        alias = str(c["alias"]).strip() if c.get("alias") else None
        nombre = nombre_columna(alias) if alias else nombre_columna(PREFIJO[v.fuente] + v.clave)
        out.append(ColumnaPlan(v, agg, nombre, alias))
    nombres = [COLUMNA_TIEMPO] + [c.nombre for c in out]
    repetidos = sorted({n for n in nombres if nombres.count(n) > 1})
    if repetidos:
        raise PlanInvalido("columna_duplicada",
                           f"archivo {i}: columnas con el mismo nombre ({', '.join(repetidos)}); "
                           f"usa 'alias' para distinguirlas")
    return tuple(out)

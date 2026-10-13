"""Las filas de un archivo del plan, en su forma (ancho o largo), listas para los writers.

Los valores de tiempo salen ya en hora LOCAL naive (cada fuente se convirtio con su
reloj), asi que los writers de `exportar` los emiten con reloj 'local', tal cual.
"""
from __future__ import annotations

from typing import Iterator

from historico import db
from historico.exportar.modelo import Columna
from historico.plan import agrodash, sql
from historico.plan.modelo import ANCHO, COLUMNA_TIEMPO, COLUMNAS_LARGO, ArchivoPlan, Plan
from historico.plan.rejilla import pivot

_TS = "timestamp without time zone"
_NUM = "double precision"


def columnas_publicas(a: ArchivoPlan) -> list[dict]:
    """Una entrada por columna pedida (contrato §4.1). En largo, `nombre` es lo que
    aparece en la columna `variable` del archivo."""
    return [{"nombre": c.nombre if a.forma == ANCHO else c.etiqueta_larga,
             "variable": c.variable.id, "etiqueta": c.variable.etiqueta,
             "fuente": c.variable.fuente, "unidad": c.variable.unidad,
             "agregacion": c.agregacion} for c in a.columnas]


def seleccion(a: ArchivoPlan) -> list[Columna]:
    """Las columnas del archivo, con el tipo que decide como las serializa cada writer."""
    if a.forma == ANCHO:
        return [Columna(COLUMNA_TIEMPO, COLUMNA_TIEMPO, _TS)] + [Columna(c.nombre, c.nombre, _NUM)
                                                                for c in a.columnas]
    tipos = {COLUMNA_TIEMPO: _TS, "valor": _NUM}
    return [Columna(n, n, tipos.get(n, "text")) for n in COLUMNAS_LARGO]


def _ancho(plan: Plan, a: ArchivoPlan) -> Iterator[tuple]:
    cols_sql = [c for c in a.columnas if not c.variable.via_api]
    cols_api = [c for c in a.columnas if c.variable.via_api]
    orden: list[tuple[str, int]] = []
    for c in a.columnas:
        lista = cols_api if c.variable.via_api else cols_sql
        orden.append(("api" if c.variable.via_api else "sql", lista.index(c)))
    # AgroDash primero (va a memoria, acotado por la rejilla); despues la base en streaming.
    api = [agrodash.sitio(c, plan.inicio, plan.fin, plan.paso_s) for c in cols_api]
    filas_sql = None
    if cols_sql:
        consulta, params = sql.ancho(cols_sql, plan.inicio, plan.fin, plan.paso_s)
        filas_sql = db.en_streaming(consulta, tuple(params))
    yield from pivot(filas_sql, len(cols_sql), plan.inicio, plan.fin, plan.paso_s, api, orden)


def _largo(plan: Plan, a: ArchivoPlan) -> Iterator[tuple]:
    """Una columna tras otra, cada una en orden temporal (y por caja)."""
    for c in a.columnas:
        v = c.variable
        if v.via_api:
            filas = agrodash.largo(c, plan.inicio, plan.fin, plan.paso_s)
        else:
            consulta, params = sql.largo(c, plan.inicio, plan.fin, plan.paso_s)
            filas = db.en_streaming(consulta, tuple(params))
        for t, caja, valor in filas:
            yield (t, v.fuente, c.etiqueta_larga, caja, valor, v.unidad)


def filas(plan: Plan, a: ArchivoPlan) -> Iterator[tuple]:
    return _ancho(plan, a) if a.forma == ANCHO else _largo(plan, a)

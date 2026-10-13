"""Remuestreo de las fuentes SQL (Supabase PV y store ambiental) en la base.

Cada nombre interpolado (relacion, columna, columna temporal, filtro) sale del
catalogo unificado, que a su vez sale de las allowlists; `paso_s` sale de una tupla
fija. Los valores (rango, variable del store, zona) van parametrizados.

El reloj se respeta por variable: las tablas PV guardan hora LOCAL etiquetada +00
(se le quita la etiqueta), el store guarda UTC real (se convierte a la zona del
sitio). La rejilla se arma sobre esa hora local naive.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from historico import config
from historico.exportar.modelo import Dataset
from historico.exportar.reloj import _limite_sql
from historico.plan.modelo import ColumnaPlan

_AGG = {
    "promedio": "avg({c})", "min": "min({c})", "max": "max({c})", "suma": "sum({c})",
    "ultimo": "(array_agg({c} ORDER BY {t} DESC) FILTER (WHERE {c} IS NOT NULL))[1]",
}


def _local(c: ColumnaPlan) -> tuple[str, list]:
    v = c.variable
    if v.reloj == "local":
        return f"({v.tcol} AT TIME ZONE 'UTC')", []
    return f"({v.tcol} AT TIME ZONE %s)", [config.TZ]


def _donde(c: ColumnaPlan, inicio: datetime, fin: datetime) -> tuple[str, list]:
    """FROM + WHERE del rango (limites en la forma que la columna compara bien)."""
    v = c.variable
    ds = Dataset("_", "supabase", "", "", "", v.tcol, reloj=v.reloj, tcol_tz=True)
    sql = f" FROM {v.relacion} WHERE {v.tcol} >= %s AND {v.tcol} < %s{v.filtro}"
    params: list = [_limite_sql(inicio, ds), _limite_sql(fin, ds)]
    if v.variable_store:
        sql += " AND variable = %s"
        params.append(v.variable_store)
    return sql, params


def _por_caja(c: ColumnaPlan) -> bool:
    return bool(c.variable.variable_store)


def agregada(c: ColumnaPlan, inicio: datetime, fin: datetime, paso_s: int,
             caja: str | None = None) -> tuple[str, list]:
    """(b, [caja,] v) por intervalo. `b` = inicio del intervalo, local naive.
    `caja`: None (sin columna), "caja" (agrupa por caja) o "NULL::text" (columna vacia)."""
    local, p_local = _local(c)
    b = f"(to_timestamp(floor(extract(epoch FROM {local}) / {int(paso_s)}) * {int(paso_s)}) AT TIME ZONE 'UTC')"
    agg = _AGG[c.agregacion].format(c=c.variable.columna, t=c.variable.tcol)
    donde, p_donde = _donde(c, inicio, fin)
    sel_caja = f", {caja} AS caja" if caja else ""
    grupos = "1, 2" if caja == "caja" else "1"
    sql = f"SELECT {b} AS b{sel_caja}, ({agg})::double precision AS v{donde} GROUP BY {grupos}"
    return sql, p_local + p_donde


def ancho(cols: list[ColumnaPlan], inicio: datetime, fin: datetime, paso_s: int) -> tuple[str, list]:
    """Una sola consulta: la rejilla completa (generate_series) con cada serie al lado.

    Pivotear en la base deja salir el archivo en streaming sin juntar N series en
    memoria. Intervalo sin dato = NULL (celda vacia), nunca relleno."""
    ultimo = fin - timedelta(seconds=paso_s)
    ctes = ["g AS (SELECT generate_series(%s::timestamp, %s::timestamp, make_interval(secs => %s)) AS b)"]
    params: list = [inicio.isoformat(), ultimo.isoformat(), paso_s]
    for k, c in enumerate(cols):
        sql, p = agregada(c, inicio, fin, paso_s)
        ctes.append(f"s{k} AS ({sql})")
        params += p
    selec = ", ".join(f"s{k}.v" for k in range(len(cols)))
    joins = " ".join(f"LEFT JOIN s{k} ON s{k}.b = g.b" for k in range(len(cols)))
    return f"WITH {', '.join(ctes)} SELECT g.b, {selec} FROM g {joins} ORDER BY g.b", params


def largo(c: ColumnaPlan, inicio: datetime, fin: datetime, paso_s: int) -> tuple[str, list]:
    """(t, caja, v) de una columna: agregada por intervalo (y caja), o cruda si paso_s=0."""
    if paso_s:
        sql, params = agregada(c, inicio, fin, paso_s, "caja" if _por_caja(c) else "NULL::text")
        return sql + " ORDER BY 1, 2", params
    local, p_local = _local(c)
    donde, p_donde = _donde(c, inicio, fin)
    caja = "caja" if _por_caja(c) else "NULL::text"
    col = c.variable.columna
    return (f"SELECT {local} AS t, {caja} AS caja, {col}::double precision AS v{donde} "
            f"AND {col} IS NOT NULL ORDER BY 1, 2"), p_local + p_donde


def conteo_crudo(c: ColumnaPlan, inicio: datetime, fin: datetime) -> tuple[str, list]:
    """Cuantas lecturas crudas no nulas tiene la columna en el rango."""
    donde, params = _donde(c, inicio, fin)
    return f"SELECT count({c.variable.columna}) AS n{donde}", params

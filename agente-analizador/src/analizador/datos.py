"""Peek de datos read-only para el debugger humano (NO es una tool del LLM).

Responsabilidad unica: exponer, de forma segura y acotada, lo que hay en la DB
para inspeccion humana en el MVP (ver filas, cobertura, series para graficar).
Se separa de `tools/` a proposito: las tools sirven al LLM (encapsulan la fisica
correcta); esto sirve al OJO HUMANO que cruza-verifica lo que el agente calculo.

Seguridad: allowlist de relaciones -> el nombre de tabla/columna nunca se
interpola sin validar contra un conjunto conocido (sin inyeccion). Todo pasa por
`db.query`, que fuerza la transaccion de SOLO LECTURA.
"""
from __future__ import annotations

from analizador import db
from analizador.periodo import rango

# clave_amigable -> (relacion_sql, columna_de_tiempo | None). Unica fuente de
# verdad de "que se puede inspeccionar". Agregar una vista = una linea aca.
RELACIONES: dict[str, tuple[str, str | None]] = {
    "electrico_crudo":       ("monitoreo_sc_electrico",   "timestamp"),
    "electrico_corregido":   ("v_sc_electrico_corregido", "timestamp"),
    "radiacion_15s_cruda":   ("radiacion_sc_15s",         "timestamp"),
    "radiacion_corregida":   ("v_sc_radiacion_corregida", "timestamp"),
    "radiacion_calibrada":   ("v_sc_radiacion_calibrada", "timestamp"),
    "radiacion_clearsky":    ("radiacion_sc_clearsky",    "timestamp"),
    "radiacion_poa":         ("radiacion_sc_poa",         "timestamp"),
    "performance":           ("v_sc_performance",         "timestamp"),
    "diccionario":           ("diccionario_variables",    None),
}

_BUCKETS = {"hour", "day", "week", "month"}
_AGGS = {"avg", "sum", "min", "max", "count"}
_LIMITE_MAX = 500


def _rel(tabla: str) -> tuple[str, str | None]:
    """Resuelve la clave amigable a (relacion, columna_tiempo). ValueError si no esta."""
    par = RELACIONES.get(tabla)
    if par is None:
        raise ValueError(
            f"relacion desconocida: {tabla!r} (validas: {', '.join(RELACIONES)})"
        )
    return par


def _columnas(rel: str) -> list[dict]:
    """Columnas reales de la relacion (nombre + tipo), en orden. Desde el catalogo."""
    return db.query(
        """
        SELECT column_name AS nombre, data_type AS tipo
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (rel,),
    )


def tablas() -> dict:
    """Panorama de cobertura: por cada relacion, conteo de filas y rango temporal.

    UNA sola consulta (UNION ALL) en vez de N -> un unico round-trip a la DB. Los
    nombres salen de la allowlist (no del cliente), por eso son seguros de interpolar."""
    partes = []
    for clave, (rel, tcol) in RELACIONES.items():
        col = tcol if tcol else "NULL"
        partes.append(
            f"SELECT '{clave}' AS clave, count(*) AS n, "
            f"min({col})::text AS mn, max({col})::text AS mx FROM {rel}"
        )
    filas = {r["clave"]: r for r in db.query(" UNION ALL ".join(partes))}
    out = []
    for clave, (rel, tcol) in RELACIONES.items():
        r = filas.get(clave, {})
        out.append({
            "clave": clave,
            "relacion": rel,
            "columna_tiempo": tcol,
            "filas": r.get("n"),
            "desde": r.get("mn"),
            "hasta": r.get("mx"),
        })
    return {"relaciones": out}


def columnas(tabla: str) -> dict:
    """Esquema (columnas + tipos) de una relacion de la allowlist."""
    rel, tcol = _rel(tabla)
    return {"tabla": tabla, "relacion": rel, "columna_tiempo": tcol,
            "columnas": _columnas(rel)}


def muestra(tabla: str, limit: int = 20, orden: str = "desc") -> dict:
    """Ultimas (o primeras) `limit` filas crudas de una relacion, para cruzar datos.

    `orden='desc'` (default) trae lo mas reciente; 'asc' lo mas antiguo. La
    relacion sale de la allowlist; el limite se acota a [1, 500]."""
    rel, tcol = _rel(tabla)
    lim = max(1, min(int(limit), _LIMITE_MAX))
    if tcol:
        direccion = "ASC" if str(orden).lower() == "asc" else "DESC"
        filas = db.query(f"SELECT * FROM {rel} ORDER BY {tcol} {direccion} LIMIT %s", (lim,))
    else:
        filas = db.query(f"SELECT * FROM {rel} LIMIT %s", (lim,))
    cols = list(filas[0].keys()) if filas else [c["nombre"] for c in _columnas(rel)]
    return {"tabla": tabla, "relacion": rel, "orden": orden,
            "columnas": cols, "filas": filas}


def serie(tabla: str, columna: str, bucket: str = "day", agg: str = "avg",
          desde: str | None = None, hasta: str | None = None) -> dict:
    """Serie temporal agregada (para graficar). Agrupa por date_trunc(bucket).

    `columna` se valida contra las columnas REALES de la relacion; `bucket` y
    `agg` contra conjuntos fijos -> los tres son seguros de interpolar."""
    rel, tcol = _rel(tabla)
    if not tcol:
        raise ValueError(f"{tabla!r} no tiene columna temporal; no admite serie")
    tipos = {c["nombre"]: c["tipo"] for c in _columnas(rel)}
    if columna not in tipos:
        raise ValueError(f"columna desconocida: {columna!r} (validas: {', '.join(sorted(tipos))})")
    if bucket not in _BUCKETS:
        raise ValueError(f"bucket invalido: {bucket!r} ({', '.join(sorted(_BUCKETS))})")
    if agg not in _AGGS:
        raise ValueError(f"agg invalido: {agg!r} ({', '.join(sorted(_AGGS))})")

    # Solo columnas numericas o booleanas admiten agregacion. El booleano se
    # castea a int -> avg(bool::int) = proporcion de TRUE (metrica util para
    # qc_ok/valido); min/max/sum/count tambien quedan validos.
    tipo = tipos[columna]
    if tipo == "boolean":
        expr = f"{columna}::int"
    elif any(t in tipo for t in ("double", "numeric", "real", "integer", "bigint", "smallint")):
        expr = columna
    else:
        raise ValueError(f"columna {columna!r} ({tipo}) no es agregable en una serie")

    d, h = rango(desde, hasta)
    puntos = db.query(
        f"""
        SELECT date_trunc(%s, {tcol})::text AS t,
               {agg}({expr})::double precision AS v,
               count({columna}) AS n
        FROM {rel}
        WHERE {tcol} >= %s AND {tcol} < %s
        GROUP BY 1 ORDER BY 1
        """,
        (bucket, d, h),
    )
    return {"tabla": tabla, "relacion": rel, "columna": columna, "bucket": bucket,
            "agg": agg, "periodo": {"desde": d, "hasta": h}, "puntos": puntos}

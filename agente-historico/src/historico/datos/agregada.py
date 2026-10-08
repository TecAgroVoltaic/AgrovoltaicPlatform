"""Serie temporal agregada de una columna de la allowlist, para graficar."""
from __future__ import annotations

from historico import db
from historico.datos.relaciones import _columnas, _rel
from historico.periodo import rango

_BUCKETS = {"hour", "day", "week", "month"}
_AGGS = {"avg", "sum", "min", "max", "count"}
_TIPOS_NUMERICOS = ("double", "numeric", "real", "integer", "bigint", "smallint")


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
    elif any(t in tipo for t in _TIPOS_NUMERICOS):
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

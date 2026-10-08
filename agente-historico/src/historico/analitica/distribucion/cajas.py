"""Fig. 6, panel superior: un box plot por mes con vallas IQR y outliers.

`_cuartiles` y `_extremos` se resuelven en la fachada del paquete: es el punto que
sustituyen las pruebas para no ir a la base.
"""
from __future__ import annotations

from datetime import datetime

from historico import db
from historico.analitica import catalogo, fuente, resultado
from historico.analitica.distribucion.comun import _FORMATO_MES_SQL, FACTOR_IQR, FORMATO_MES, _meses
from historico.analitica.ventana import Ventana


def _cuartiles(v: Ventana, o: fuente.Origen) -> list[dict]:
    """Los cinco numeros del box plot por mes, agregados en la base."""
    return db.query(
        f"""
        SELECT to_char(date_trunc('month', "timestamp"), '{_FORMATO_MES_SQL}') AS mes,
               count({o.columna})                  AS n,
               min({o.columna})                    AS minimo,
               max({o.columna})                    AS maximo,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY {o.columna}) AS q1,
               percentile_cont(0.50) WITHIN GROUP (ORDER BY {o.columna}) AS mediana,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY {o.columna}) AS q3
        {fuente.donde(o)}
         GROUP BY 1
        """,
        v.sql,
    )


def vallas(cuartiles: list[dict]) -> dict[str, tuple[float, float]]:
    """El criterio IQR, sin base de datos: donde empieza a ser outlier cada mes.

    Un mes con menos de dos lecturas no tiene cuartiles y por lo tanto no tiene
    vallas: no se inventa un rango a partir de un punto.
    """
    limites = {}
    for fila in cuartiles:
        q1, q3 = fila.get("q1"), fila.get("q3")
        if q1 is None or q3 is None:
            continue
        margen = FACTOR_IQR * (q3 - q1)
        limites[fila["mes"]] = (q1 - margen, q3 + margen)
    return limites


def _extremos(v: Ventana, o: fuente.Origen,
              limites: dict[str, tuple[float, float]]) -> dict[str, dict]:
    """Cuantos puntos caen fuera de las vallas y donde llegan los bigotes.

    Las vallas viajan como ARRAYS parametrizados (`unnest`), nunca interpoladas.
    """
    if not limites:
        return {}
    meses = sorted(limites)
    mes_sql = f"to_char(date_trunc('month', r.\"timestamp\"), '{_FORMATO_MES_SQL}')"
    filas = db.query(
        f"""
        WITH vallas AS (
          SELECT * FROM unnest(%s::text[], %s::double precision[], %s::double precision[])
                 AS t(mes, bajo, alto))
        SELECT l.mes,
               count(*) FILTER (WHERE r.{o.columna} < l.bajo) AS outliers_bajos,
               count(*) FILTER (WHERE r.{o.columna} > l.alto) AS outliers_altos,
               min(r.{o.columna}) FILTER (WHERE r.{o.columna} >= l.bajo) AS bigote_inferior,
               max(r.{o.columna}) FILTER (WHERE r.{o.columna} <= l.alto) AS bigote_superior
          FROM vallas l
          JOIN {o.relacion} r ON {mes_sql} = l.mes
         WHERE r."timestamp" >= %s AND r."timestamp" < %s
           AND r.{o.columna} IS NOT NULL{o.filtro}
         GROUP BY 1
        """,
        (meses, [limites[m][0] for m in meses], [limites[m][1] for m in meses], *v.sql),
    )
    return {f.pop("mes"): f for f in filas}


def reducir(meses: list[datetime], cuartiles: list[dict],
            limites: dict[str, tuple[float, float]],
            extremos: dict[str, dict]) -> list[dict]:
    """Arma una caja por mes de la rejilla. Pura: se prueba sin base de datos."""
    por_mes = {f["mes"]: f for f in cuartiles}
    cajas = []
    for t in meses:
        mes = t.strftime(FORMATO_MES)
        f, e = por_mes.get(mes, {}), extremos.get(mes, {})
        bajo, alto = limites.get(mes, (None, None))
        q1, q3 = f.get("q1"), f.get("q3")
        cajas.append({
            "mes": mes, "n": int(f.get("n") or 0),
            "minimo": f.get("minimo"), "q1": q1, "mediana": f.get("mediana"),
            "q3": q3, "maximo": f.get("maximo"),
            "iqr": q3 - q1 if q1 is not None and q3 is not None else None,
            "valla_inferior": bajo, "valla_superior": alto,
            # El bigote llega al dato mas extremo DENTRO de la valla, no a la valla.
            "bigote_inferior": e.get("bigote_inferior"),
            "bigote_superior": e.get("bigote_superior"),
            "outliers_bajos": int(e.get("outliers_bajos") or 0),
            "outliers_altos": int(e.get("outliers_altos") or 0),
        })
    return cajas


def cajas_mensuales(v: Ventana, variable: str) -> dict:
    """Fig. 6 (panel superior): un box plot por mes dentro de la ventana."""
    from historico.analitica import distribucion as fachada

    var, o = catalogo.obtener(variable), fuente.origen(variable)
    meses = _meses(v)
    # DOS tandas, no una: `_extremos` necesita las vallas, y las vallas salen de los
    # cuartiles, asi que esa consulta SI depende de la anterior y no se puede
    # adelantar. Lo que si se puede es sacar la confianza junto con los cuartiles,
    # que no se deben nada. Tres viajes al pooler pasan a dos. Ver `db.en_paralelo`.
    confianza, cuartiles = db.en_paralelo(
        lambda: fuente.confianza_de(v, [variable]),
        lambda: fachada._cuartiles(v, o),
    )
    limites = vallas(cuartiles)
    cajas = reducir(meses, cuartiles, limites, fachada._extremos(v, o, limites))
    return resultado.sobre(
        v, confianza,
        variable={"clave": variable, "etiqueta": var.etiqueta, "unidad": var.unidad},
        factor_iqr=FACTOR_IQR, cajas=cajas,
    )

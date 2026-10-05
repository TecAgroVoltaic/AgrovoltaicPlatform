"""Fig. 6: como se DISTRIBUYE una variable mes a mes, y cuanta radiacion entro.

Dos paneles distintos que responden a la misma pregunta con distinta forma:

* **Box plot por mes.** Minimo, Q1, mediana, Q3, maximo y los outliers por el
  criterio IQR. Los cuartiles se calculan con `percentile_cont` EN LA BASE: agregar
  ahi cuesta una consulta, y traer las 94.868 filas de radiacion al proceso para
  ordenarlas en Python cuesta la red, la memoria y el tiempo de las tres.
* **Barras de irradiacion mensual acumulada (kWh/m2).** Integral de la irradiancia,
  no promedio: lo que interesa de un mes es cuanta energia entro.

**La integral no es una suma, porque la cadencia cambia.** Cada lectura pesa el
salto real hasta la siguiente, acotado (ver `fuente.TECHO_SALTO_SEG`): la tabla de
radiacion convive con saltos de 15, 30, 45, 60, 75, 300, 315 y 330 s segun la
epoca, y pesarlos todos igual subestimaria marzo 2026 veinte veces. Verificado: con
este peso los meses dan 2,4 a 4,5 kWh/m2/dia, que es el orden fisico de San Carlos.

Los meses SIN datos se emiten igual, con `n = 0` y todo en `None`. Un box plot que
salta de febrero a abril hace creer que marzo no existio, cuando lo que paso es que
el sistema no reporto.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from historico import db
from historico.analitica import catalogo, fuente, resultado
from historico.analitica.ventana import MES, Ventana

# Criterio de outlier del documento: fuera de [Q1 - 1,5*IQR, Q3 + 1,5*IQR].
FACTOR_IQR = 1.5
# 20 años de cajas. Solo frena ventanas absurdas (`ventana.crear()` sin `hasta` abre
# hasta 2100); el historico real son 19 meses.
MAXIMO_MESES = 240
# Una sola lectura no define una integral: no hay intervalo que pesar. Se reporta
# como sin valor en vez de como un cero, que se leeria "ese mes no hubo sol".
MINIMO_LECTURAS_INTEGRAL = 2

IRRADIANCIA_POR_DEFECTO = "irradiancia_incidente_wm2"
UNIDAD_IRRADIANCIA = "W/m2"
UNIDAD_IRRADIACION = "kWh/m2"
# (W/m2) * s = J/m2; entre esto queda kWh/m2.
JULIOS_POR_KWH = 3_600_000.0

FORMATO_MES = "%Y-%m"
_FORMATO_MES_SQL = "YYYY-MM"


def _meses(v: Ventana) -> list[datetime]:
    """Los meses de la ventana, incluidos los que no tienen ni una lectura."""
    mensual = replace(v, granularidad=MES)
    fuente.validar_tamano(mensual, MAXIMO_MESES)
    return fuente.rejilla(mensual)


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
    var, o = catalogo.obtener(variable), fuente.origen(variable)
    meses = _meses(v)
    # DOS tandas, no una: `_extremos` necesita las vallas, y las vallas salen de los
    # cuartiles, asi que esa consulta SI depende de la anterior y no se puede
    # adelantar. Lo que si se puede es sacar la confianza junto con los cuartiles,
    # que no se deben nada. Tres viajes al pooler pasan a dos. Ver `db.en_paralelo`.
    confianza, cuartiles = db.en_paralelo(
        lambda: fuente.confianza_de(v, [variable]),
        lambda: _cuartiles(v, o),
    )
    limites = vallas(cuartiles)
    cajas = reducir(meses, cuartiles, limites, _extremos(v, o, limites))
    return resultado.sobre(
        v, confianza,
        variable={"clave": variable, "etiqueta": var.etiqueta, "unidad": var.unidad},
        factor_iqr=FACTOR_IQR, cajas=cajas,
    )


def reducir_irradiacion(meses: list[datetime], filas: list[dict]) -> list[dict]:
    """Julios por metro cuadrado a kWh/m2, un renglon por mes. Pura.

    La media diaria se divide por los dias CON DATO y no por los del mes: un mes con
    seis dias registrados no acumulo poco, es que casi no se midio, y dividir entre
    30 lo haria pasar por un mes oscuro.
    """
    por_mes = {f["mes"]: f for f in filas}
    barras = []
    for t in meses:
        mes = t.strftime(FORMATO_MES)
        f = por_mes.get(mes, {})
        n, dias = int(f.get("n") or 0), int(f.get("dias") or 0)
        integrable = n >= MINIMO_LECTURAS_INTEGRAL and f.get("julios_m2") is not None
        total = f["julios_m2"] / JULIOS_POR_KWH if integrable else None
        barras.append({
            "mes": mes, "n": n, "dias_con_dato": dias,
            "irradiacion": resultado.metrica(
                round(total, 2) if total is not None else None, n, UNIDAD_IRRADIACION),
            "media_diaria": resultado.metrica(
                round(total / dias, 2) if total is not None and dias else None,
                n, f"{UNIDAD_IRRADIACION}/dia"),
        })
    return barras


def irradiacion_mensual(v: Ventana, variable: str = IRRADIANCIA_POR_DEFECTO) -> dict:
    """Fig. 6 (panel GHI): irradiacion acumulada por mes, integrando a cadencia real."""
    var, o = catalogo.obtener(variable), fuente.origen(variable)
    if var.unidad != UNIDAD_IRRADIANCIA:
        raise ValueError(
            f"{variable!r} ({var.unidad}) no se puede integrar a {UNIDAD_IRRADIACION}: "
            f"hace falta una irradiancia en {UNIDAD_IRRADIANCIA}"
        )
    # La integral y la confianza son independientes: van a la vez y el endpoint pasa
    # de dos viajes al pooler a uno. Ver `db.en_paralelo`.
    confianza, filas = db.en_paralelo(
        lambda: fuente.confianza_de(v, [variable]),
        lambda: db.query(
            f"""
            WITH lecturas AS ({fuente.lecturas_pesadas(o)})
            SELECT to_char(date_trunc('month', ts), '{_FORMATO_MES_SQL}') AS mes,
                   sum(valor * segundos)::double precision AS julios_m2,
                   count(valor)                            AS n,
                   count(DISTINCT ts::date)                AS dias
              FROM lecturas
             GROUP BY 1
            """,
            v.sql,
        ),
    )
    barras = reducir_irradiacion(_meses(v), filas)
    total = sum(b["irradiacion"]["valor"] or 0 for b in barras)
    n_total = sum(b["n"] for b in barras)
    return resultado.sobre(
        v, confianza,
        variable={"clave": variable, "etiqueta": var.etiqueta, "unidad": var.unidad},
        techo_salto_seg=fuente.TECHO_SALTO_SEG, barras=barras,
        total=resultado.metrica(round(total, 2), n_total, UNIDAD_IRRADIACION),
    )

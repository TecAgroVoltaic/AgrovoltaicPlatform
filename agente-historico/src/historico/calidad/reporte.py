"""Reporte legible de lo que encontro el barrido.

El store de hallazgos es para consultar con SQL; esto es para leer. Responde de un
vistazo: que dias no sirven, que sensor esta fallando y como estuvo el cielo.

Deliberadamente sin LLM: los numeros salen del store y el texto es plantilla. La
narracion en lenguaje natural es una capa DE ARRIBA que se enchufa despues, cuando
se retome la capa de agentes; que el reporte dependa de un modelo para existir
seria ponerlo en el camino critico, justo lo que capa-agentes.md decidio no hacer.
"""
from __future__ import annotations

from datetime import date

from historico import db

_SEVERIDAD_ORDEN = {"grave": 0, "aviso": 1, "info": 2}
_ICONO = {"grave": "!!", "aviso": " !", "info": "  "}


def hallazgos_por_tipo(desde: date, hasta: date) -> list[dict]:
    """Un renglon por (fuente, tipo, severidad) con dias, variables, lecturas y
    el rango de fechas que abarca.

    Publica y no privada porque tiene DOS consumidores: el reporte de texto y la
    vista de calidad de la consola, que necesita `fuente` y las fechas extremas.
    El resumen que ve el LLM (`calidad_periodo`) es otro: recorta a los cinco
    problemas mas frecuentes y no trae fuente ni fechas."""
    return db.query(
        """
        SELECT fuente, tipo, severidad,
               count(DISTINCT fecha)    AS dias,
               count(DISTINCT variable) AS variables,
               sum(n_afectadas)         AS lecturas,
               min(fecha)               AS primer_dia,
               max(fecha)               AS ultimo_dia
          FROM hallazgos_calidad
         WHERE fecha >= %s AND fecha < %s
         GROUP BY fuente, tipo, severidad
         ORDER BY fuente, severidad, dias DESC
        """,
        (desde, hasta),
    )


def _peores_dias(desde: date, hasta: date, n: int = 10) -> list[dict]:
    return db.query(
        """
        SELECT fecha,
               count(*) FILTER (WHERE severidad = 'grave') AS graves,
               count(*) FILTER (WHERE severidad = 'aviso') AS avisos,
               string_agg(DISTINCT tipo, ', ' ORDER BY tipo) AS tipos
          FROM hallazgos_calidad
         WHERE fecha >= %s AND fecha < %s
         GROUP BY fecha
        HAVING count(*) FILTER (WHERE severidad = 'grave') > 0
         ORDER BY graves DESC, avisos DESC, fecha DESC
         LIMIT %s
        """,
        (desde, hasta, n),
    )


def _cielo(desde: date, hasta: date) -> dict:
    return db.uno(
        """
        SELECT count(*)                                      AS dias,
               round(avg(kt_medio)::numeric, 3)              AS kt_medio,
               round(avg(indice_variabilidad)::numeric, 2)   AS vi_medio,
               count(*) FILTER (WHERE clase = 'despejado')   AS despejados,
               count(*) FILTER (WHERE clase = 'parcial')     AS parciales,
               count(*) FILTER (WHERE clase = 'cubierto')    AS cubiertos,
               count(*) FILTER (WHERE clase = 'variable')    AS variables,
               round((100.0 * sum(energia_medida_whm2)
                      / nullif(sum(energia_cs_whm2), 0))::numeric, 1) AS pct_del_techo
          FROM cielo_diario
         WHERE fecha >= %s AND fecha < %s
        """,
        (desde, hasta),
    )


def _cobertura(desde: date, hasta: date) -> dict:
    return db.uno(
        """
        SELECT (SELECT count(DISTINCT "timestamp"::date) FROM radiacion_sc_15s
                 WHERE "timestamp" >= %s AND "timestamp" < %s)      AS dias_con_datos,
               (SELECT count(*) FROM ventana_solar
                 WHERE fecha >= %s AND fecha < %s)                  AS dias_de_calendario
        """,
        (desde, hasta, desde, hasta),
    )


def generar(desde: date, hasta: date) -> str:
    """Arma el reporte del periodo [desde, hasta) como texto plano."""
    L: list[str] = []
    L.append(f"REPORTE DE CALIDAD · San Carlos PV · {desde} a {hasta} (fin exclusivo)")
    L.append("=" * 78)

    cob = _cobertura(desde, hasta)
    con, cal = cob.get("dias_con_datos", 0), cob.get("dias_de_calendario", 0)
    pct = f"{100.0 * con / cal:.0f} %" if cal else "sin calendario"
    L.append("")
    L.append(f"Cobertura   {con} dias con datos de {cal} de calendario ({pct})")

    c = _cielo(desde, hasta)
    if c.get("dias"):
        L.append("")
        L.append(f"Cielo       {c['dias']} dias caracterizados · kt medio {c['kt_medio']} · "
                 f"VI medio {c['vi_medio']}")
        L.append(f"            despejados {c['despejados']} · parciales {c['parciales']} · "
                 f"cubiertos {c['cubiertos']} · variables {c['variables']}")
        L.append(f"            la irradiancia medida fue el {c['pct_del_techo']} % de la "
                 f"de cielo despejado")

    filas = hallazgos_por_tipo(desde, hasta)
    L.append("")
    L.append("HALLAZGOS")
    L.append("-" * 78)
    if not filas:
        L.append("  ninguno")
    else:
        filas.sort(key=lambda f: (f["fuente"], _SEVERIDAD_ORDEN[f["severidad"]], -f["dias"]))
        fuente_actual = None
        for f in filas:
            if f["fuente"] != fuente_actual:
                fuente_actual = f["fuente"]
                L.append("")
                L.append(f"  {fuente_actual}")
            lecturas = f"{f['lecturas']:,}".replace(",", ".") if f["lecturas"] else "-"
            # dias y variables por separado: un mismo dia puede tener el problema en
            # varias columnas, y sumarlos daba "743 dias" en un periodo de 274.
            var = f"{f['variables']} var" if f["variables"] > 1 else ""
            L.append(f"  {_ICONO[f['severidad']]} {f['tipo']:<20} {f['dias']:>4} dias "
                     f"{var:>7}  {lecturas:>10} lect   {f['primer_dia']} a {f['ultimo_dia']}")

    peores = _peores_dias(desde, hasta)
    if peores:
        L.append("")
        L.append("PEORES DIAS")
        L.append("-" * 78)
        for p in peores:
            L.append(f"  {p['fecha']}  {p['graves']} graves, {p['avisos']} avisos   {p['tipos']}")

    L.append("")
    L.append("Leyenda: !! grave (el dato no sirve)  · ! aviso (usable con cuidado)  ·"
             "  info (contexto)")
    return "\n".join(L)

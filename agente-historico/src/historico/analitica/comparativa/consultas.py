"""Las tres consultas propias del comparativo: energia por periodo, curva y emparejado."""
from __future__ import annotations

_SQL_ENERGIA = """
    SELECT date_trunc(%s, "timestamp") AS periodo,
           sum(potencia_pv1_w) * %s AS energia_inclinado_wh,
           sum(potencia_pv2_w) * %s AS energia_vertical_wh,
           count(potencia_pv1_w)     AS n_inclinado,
           count(potencia_pv2_w)     AS n_vertical,
           count(DISTINCT "timestamp"::date) AS dias_con_datos
      FROM v_sc_electrico_corregido
     WHERE "timestamp" >= %s AND "timestamp" < %s
     GROUP BY 1 ORDER BY 1
"""

# Sin conversion de zona horaria: `extract(hour ...)` YA devuelve la hora local.
_SQL_CURVA = """
    SELECT extract(hour from "timestamp")::int AS hora,
           avg(potencia_pv1_w) AS inclinado_w,
           avg(potencia_pv2_w) AS vertical_w,
           count(potencia_pv1_w) AS n_inclinado,
           count(potencia_pv2_w) AS n_vertical
      FROM v_sc_electrico_corregido
     WHERE "timestamp" >= %s AND "timestamp" < %s
     GROUP BY 1 ORDER BY 1
"""

# El EMPAREJAMIENTO PUNTO A PUNTO a 5 minutos, que R1 avala para este uso y NO para
# el PR. `pr_pv1 IS NOT NULL` se usa como SELECTOR DE FILA y no como valor: en
# `v_sc_performance` esa columna esta definida solo donde la POA supera 100 W/m2 y la
# potencia no es negativa, que es exactamente el par utilizable. Asi energia e
# insolacion cubren las MISMAS ventanas de 5 min; si no, el cociente compara periodos
# distintos. De aca no sale ningun Performance Ratio.
_SQL_EMPAREJADO = """
    SELECT sum(potencia_pv1_w) FILTER (WHERE pr_pv1 IS NOT NULL) AS potencia_inclinado,
           sum(poa_pv1_wm2)    FILTER (WHERE pr_pv1 IS NOT NULL) AS poa_inclinado,
           sum(potencia_pv2_w) FILTER (WHERE pr_pv2 IS NOT NULL) AS potencia_vertical,
           sum(poa_pv2_wm2)    FILTER (WHERE pr_pv2 IS NOT NULL) AS poa_vertical,
           count(*) FILTER (WHERE pr_pv1 IS NOT NULL) AS n_inclinado,
           count(*) FILTER (WHERE pr_pv2 IS NOT NULL) AS n_vertical
      FROM v_sc_performance
     WHERE "timestamp" >= %s AND "timestamp" < %s
"""

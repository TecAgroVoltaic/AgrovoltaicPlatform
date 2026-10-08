"""El SQL del cielo diario: la caracterizacion por kt/VI y los dos UPSERT."""
from __future__ import annotations

_UPSERT_CIELO = """
    INSERT INTO cielo_diario
        (fecha, n_muestras_dia, kt_medio, kt_mediana, frac_despejado, frac_parcial,
         frac_cubierto, indice_variabilidad, clase, energia_medida_whm2,
         energia_cs_whm2, calculado_en)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
    ON CONFLICT (fecha) DO UPDATE SET
        n_muestras_dia = EXCLUDED.n_muestras_dia,
        kt_medio = EXCLUDED.kt_medio, kt_mediana = EXCLUDED.kt_mediana,
        frac_despejado = EXCLUDED.frac_despejado, frac_parcial = EXCLUDED.frac_parcial,
        frac_cubierto = EXCLUDED.frac_cubierto,
        indice_variabilidad = EXCLUDED.indice_variabilidad, clase = EXCLUDED.clase,
        energia_medida_whm2 = EXCLUDED.energia_medida_whm2,
        energia_cs_whm2 = EXCLUDED.energia_cs_whm2,
        calculado_en = EXCLUDED.calculado_en
"""

_UPSERT_HALLAZGO = """
    INSERT INTO hallazgos_calidad
        (fecha, fuente, variable, tipo, severidad, n_afectadas, detalle, detectado_en)
    VALUES (%s, 'radiacion_sc_15s', 'irradiancia_incidente', 'kt_imposible',
            %s, %s, %s::jsonb, now())
    ON CONFLICT (fecha, fuente, variable, tipo) DO UPDATE
       SET severidad = EXCLUDED.severidad, n_afectadas = EXCLUDED.n_afectadas,
           detalle = EXCLUDED.detalle, detectado_en = EXCLUDED.detectado_en
"""

# DOS cuidados que no son opcionales, los dos descubiertos corriendo esto:
#
# 1. Las muestras con kt > KT_IMPOSIBLE se EXCLUYEN de la estadistica. Si no, un
#    dia con la calibracion rota daba kt medio 5,67, o sea que el promedio diario
#    reportaba mas de cinco veces la energia del cielo despejado. Se cuentan
#    aparte, como hallazgo: son un problema de calidad, no una caracteristica del
#    cielo, y mezclarlas hace que un dato malo se disfrace de dia soleado.
#
# 2. El VI se calcula sobre una REJILLA UNIFORME de 5 minutos, no sobre las
#    muestras crudas. El indice de variabilidad esta definido para un intervalo
#    fijo, y el historico tiene 33 cadencias distintas. Calculado en crudo daba
#    VI 4,2 con cadencia de 315 s y VI 23,8 con cadencia de 42 s **para el mismo
#    kt**: el numerador no encoge al afinar el muestreo (el ruido de nubes es de
#    alta frecuencia) pero el denominador si (el cielo despejado es suave), asi
#    que el cociente medía la cadencia del logger en vez del cielo. Con la rejilla
#    los dias son comparables entre si. Se usan 5 min porque es el regimen
#    dominante (195 de 274 dias): los dias mas finos se agregan hacia abajo, que
#    es honesto; inventar muestras hacia arriba no lo seria.
_SQL_CIELO = """
    WITH m AS (
        SELECT c."timestamp" AS ts,
               c."timestamp"::date AS fecha,
               r.irradiancia_incidente_wm2 AS ghi,
               c.cs_ghi_wm2 AS cs,
               r.irradiancia_incidente_wm2 / c.cs_ghi_wm2 AS kt
          FROM v_sc_radiacion_calibrada r
          JOIN radiacion_sc_clearsky   c USING ("timestamp")
         WHERE c."timestamp" >= %s AND c."timestamp" < %s
           AND c.cs_ghi_wm2 > %s
           AND r.irradiancia_incidente_wm2 IS NOT NULL
    ),
    imposibles AS (
        SELECT fecha, count(*) AS n_imposible, max(kt) AS kt_max, count(*) AS _n
          FROM m WHERE kt > %s GROUP BY fecha
    ),
    totales AS (
        SELECT fecha, count(*) AS n_total FROM m GROUP BY fecha
    ),
    rejilla AS (
        SELECT fecha,
               to_timestamp(floor(EXTRACT(epoch FROM ts) / 300) * 300) AS t5,
               avg(ghi) AS ghi, avg(cs) AS cs, avg(kt) AS kt
          FROM m
         WHERE kt <= %s
         GROUP BY 1, 2
    ),
    d AS (
        SELECT fecha, kt,
               ghi - lag(ghi) OVER w AS d_ghi,
               cs  - lag(cs)  OVER w AS d_cs,
               EXTRACT(epoch FROM (t5 - lag(t5) OVER w)) / 60.0 AS d_min,
               (ghi + lag(ghi) OVER w) / 2.0 AS trap_ghi,
               (cs  + lag(cs)  OVER w) / 2.0 AS trap_cs
          FROM rejilla
        WINDOW w AS (PARTITION BY fecha ORDER BY t5)
    )
    SELECT t.fecha,
           count(d.kt)                                                 AS n,
           t.n_total,
           COALESCE(i.n_imposible, 0)                                  AS n_kt_imposible,
           i.kt_max,
           avg(d.kt)                                                   AS kt_medio,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY d.kt)           AS kt_mediana,
           count(*) FILTER (WHERE d.kt >= %s)::float
             / nullif(count(d.kt), 0)                                  AS frac_despejado,
           count(*) FILTER (WHERE d.kt >= %s AND d.kt < %s)::float
             / nullif(count(d.kt), 0)                                  AS frac_parcial,
           count(*) FILTER (WHERE d.kt < %s)::float
             / nullif(count(d.kt), 0)                                  AS frac_cubierto,
           sum(sqrt(d.d_ghi * d.d_ghi + d.d_min * d.d_min))
             / nullif(sum(sqrt(d.d_cs * d.d_cs + d.d_min * d.d_min)), 0) AS vi,
           sum(d.trap_ghi * d.d_min / 60.0)                            AS energia_medida,
           sum(d.trap_cs  * d.d_min / 60.0)                            AS energia_cs
      FROM totales t
      LEFT JOIN d          ON d.fecha = t.fecha
      LEFT JOIN imposibles i ON i.fecha = t.fecha
     GROUP BY t.fecha, t.n_total, i.n_imposible, i.kt_max
     ORDER BY t.fecha
"""

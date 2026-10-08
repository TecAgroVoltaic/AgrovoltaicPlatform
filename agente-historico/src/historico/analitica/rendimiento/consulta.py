"""La UNICA consulta del PR: un renglon por dia con radiacion o electrico."""
from __future__ import annotations

from historico import db
from historico.analitica import contaminacion
from historico.analitica.rendimiento.constantes import (
    DT_ULTIMA_FILA_SEG,
    HORAS_FORMULA_LITERAL,
    MAXIMO_CONTADOR_DIARIO_KWH,
    TECHO_DT_SEG,
)
from historico.analitica.ventana import Ventana

_SQL_DIARIO = f"""
    WITH {contaminacion.CTE_SUCIAS}, rad AS (
        SELECT r."timestamp"::date AS dia,
               r.irradiancia_incidente_wm2 AS ghi,
               p.poa_pv1_wm2, p.poa_pv2_wm2,
               p.poa_pv1_front_wm2, p.poa_pv2_front_wm2,
               LEAST(COALESCE(EXTRACT(epoch FROM (
                        lead(r."timestamp") OVER (PARTITION BY r."timestamp"::date
                                                  ORDER BY r."timestamp")
                        - r."timestamp")), %s), %s) AS dt
          FROM v_sc_radiacion_calibrada r
          LEFT JOIN radiacion_sc_poa p USING ("timestamp")
         WHERE r."timestamp" >= %s AND r."timestamp" < %s
           AND r.irradiancia_incidente_wm2 IS NOT NULL
           -- `radiacion_sc_poa` esta construida SOLO sobre filas qc_ok. Sin este
           -- filtro el GHI se integraria sobre una rejilla mas ancha que la POA y
           -- los dos denominadores dejarian de hablar del mismo dia (el 2025-09-22
           -- daria 14.738 Wh/m2, fisicamente imposible).
           AND r.qc_ok
    ), rad_dia AS (
        SELECT dia,
               count(*)                              AS n_radiacion,
               sum(dt) / 3600.0                      AS horas_rad,
               sum(ghi * dt) / 3600.0                AS ghi_wh_m2,
               sum(ghi) * %s                         AS ghi_wh_m2_literal,
               sum(poa_pv1_wm2 * dt) / 3600.0        AS poa1_bif_wh_m2,
               sum(poa_pv2_wm2 * dt) / 3600.0        AS poa2_bif_wh_m2,
               sum(poa_pv1_front_wm2 * dt) / 3600.0  AS poa1_front_wh_m2,
               sum(poa_pv2_front_wm2 * dt) / 3600.0  AS poa2_front_wh_m2
          FROM rad GROUP BY dia
    ), ele AS (
        SELECT e."timestamp"::date AS dia,
               e.potencia_pv1_w, e.potencia_pv2_w,
               -- La vista corregida todavia no limpia la energia: hasta que se
               -- aplique `sql/003_electrico_sin_falsos_positivos.sql`, las dos
               -- columnas de contador se anulan aca con la firma compartida. Se
               -- anula la COLUMNA y no la fila, que es lo que hara la vista: la
               -- fila conserva su potencia y su marca, y por lo tanto el `dt` que
               -- esa marca define. Descartarla movia `horas_ele`.
               {contaminacion.anular("energia_pv1_wh", fila="e")},
               {contaminacion.anular("energia_pv2_wh", fila="e")},
               LEAST(COALESCE(EXTRACT(epoch FROM (
                        lead(e."timestamp") OVER (PARTITION BY e."timestamp"::date
                                                  ORDER BY e."timestamp")
                        - e."timestamp")), %s), %s) AS dt
          FROM v_sc_electrico_corregido e
          {contaminacion.JOIN_SUCIAS}
         WHERE e."timestamp" >= %s AND e."timestamp" < %s
    ), ele_dia AS (
        SELECT dia,
               count(*)                          AS n_electrico,
               sum(dt) / 3600.0                  AS horas_ele,
               sum(potencia_pv1_w * dt) / 3600.0 AS e1_integral_wh,
               sum(potencia_pv2_w * dt) / 3600.0 AS e2_integral_wh,
               -- "el total acumulado al final de dia" (R1). Es un contador DIARIO
               -- que se reinicia a medianoche, asi que el MAXIMO del dia es su
               -- cierre: el reinicio de las 00:00 abre el dia SIGUIENTE en 0 y no
               -- entra aca, y un retroceso intra-dia (reinicio del inversor al
               -- amanecer) no borra lo que ya se habia acumulado.
               max(energia_pv1_wh) FILTER (WHERE energia_pv1_wh <= %s) AS e1_contador_kwh,
               max(energia_pv2_wh) FILTER (WHERE energia_pv2_wh <= %s) AS e2_contador_kwh
          FROM ele GROUP BY dia
    )
    SELECT COALESCE(r.dia, e.dia)::text AS dia, v.horas_sol,
           r.n_radiacion, r.horas_rad, r.ghi_wh_m2, r.ghi_wh_m2_literal,
           r.poa1_bif_wh_m2, r.poa2_bif_wh_m2, r.poa1_front_wh_m2, r.poa2_front_wh_m2,
           e.n_electrico, e.horas_ele, e.e1_integral_wh, e.e2_integral_wh,
           e.e1_contador_kwh, e.e2_contador_kwh
      FROM rad_dia r
      FULL JOIN ele_dia e ON e.dia = r.dia
      LEFT JOIN ventana_solar v ON v.fecha = COALESCE(r.dia, e.dia)
     ORDER BY 1
"""


def consultar(ventana: Ventana) -> list[dict]:
    """Un renglon por dia con radiacion o electrico en la ventana. La UNICA consulta.

    Publica porque `comparativa.py` la reusa: el PR de los dos arreglos tiene que
    salir de estas mismas filas, o el comparativo y la tool `performance_ratio`
    darian dos numeros distintos para la misma cosa. Los parametros van en el orden
    en que aparecen los `%s`, y el CTE de las filas sucias es el PRIMERO.
    """
    desde, hasta = ventana.sql
    return db.query(_SQL_DIARIO, (
        desde, hasta,                                        # sucias
        DT_ULTIMA_FILA_SEG, TECHO_DT_SEG, desde, hasta,      # rad
        HORAS_FORMULA_LITERAL,                               # rad_dia
        DT_ULTIMA_FILA_SEG, TECHO_DT_SEG, desde, hasta,      # ele
        MAXIMO_CONTADOR_DIARIO_KWH, MAXIMO_CONTADOR_DIARIO_KWH,   # ele_dia
    ))

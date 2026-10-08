"""La UNICA consulta de la energia: un renglon por dia, ya sin las filas mezcladas.

Se usa a traves de `energia`, que reexporta `por_dia` y `_SQL_POR_DIA`.
"""
from __future__ import annotations

from historico import db
from historico.analitica import contaminacion
from historico.analitica.ventana import Ventana

# ── La firma de la fila mezclada ─────────────────────────────────────────────
#
# El criterio ya no vive aca: es el de `analitica.contaminacion`, compartido con
# `rendimiento.py` y amarrado por test a la firma de `sql/003`. Lo que sigue siendo
# de este modulo es POR QUE hace falta, y es una sola frase: la contaminacion se
# filtra por FIRMA DE FILA y nunca por rango sobre la columna de energia. Los
# 39.328.367 de `max(energia_total_wh)` salen de UNA fila (`2025-10-07 07:45`), la
# misma que da 26.503.162 W de potencia; y el segundo registro sospechoso, el ultimo
# del 2026-03-09, entra por sus 121,3 A de `corriente_pv2_a`, no por sus 137,25 kWh.
# Un tope sobre la propia energia recortaria dias record legitimos y dejaria pasar
# filas mezcladas de valor pequeño.
#
# La firma se evalua por ANTI-JOIN y no por `NOT (firma)`: `NOT` sobre una firma con
# NULLs devuelve NULL, el `WHERE` lo trata como falso y se lleva medio historico por
# delante (la logica ternaria de SQL ya nos mordio una vez). Y lo que se anula es la
# COLUMNA, no la fila, igual que hara la vista: ver `contaminacion.anular`.
#
# MIGRACION PENDIENTE: `v_sc_electrico_corregido` hoy deja pasar las cuatro columnas
# de energia SIN NINGUN `CASE` y no descarta ni una fila (verificado con
# `pg_get_viewdef`: la vista "corregida" devuelve los mismos 39 MWh que la cruda).
# `sql/003_electrico_sin_falsos_positivos.sql` lo arregla. Cuando esa migracion este
# aplicada, el CTE `sucias` sobra: se borra y la consulta lee la vista directa.
_SQL_POR_DIA = f"""
    WITH {contaminacion.CTE_SUCIAS}, base AS (
        SELECT v."timestamp", v.potencia_pv1_w, v.potencia_pv2_w,
               {contaminacion.anular("energia_hoy_wh")},
               {contaminacion.anular("energia_total_wh")},
               {contaminacion.anular("energia_pv1_wh")},
               {contaminacion.anular("energia_pv2_wh")}
          FROM v_sc_electrico_corregido v
          {contaminacion.JOIN_SUCIAS}
         WHERE v."timestamp" >= %s AND v."timestamp" < %s
    )
    SELECT "timestamp"::date          AS dia,
           max(energia_hoy_wh)        AS ac_cierre,
           count(energia_hoy_wh)      AS n_ac,
           (array_agg(energia_total_wh ORDER BY "timestamp" ASC)
              FILTER (WHERE energia_total_wh IS NOT NULL))[1]  AS vida_primero,
           (array_agg(energia_total_wh ORDER BY "timestamp" DESC)
              FILTER (WHERE energia_total_wh IS NOT NULL))[1]  AS vida_ultimo,
           count(energia_total_wh)    AS n_vida,
           max(energia_pv1_wh)        AS dc_cierre_inclinado,
           max(energia_pv2_wh)        AS dc_cierre_vertical,
           count(energia_pv1_wh)      AS n_dc_inclinado,
           count(energia_pv2_wh)      AS n_dc_vertical,
           sum(potencia_pv1_w)        AS w_inclinado,
           sum(potencia_pv2_w)        AS w_vertical,
           count(potencia_pv1_w)      AS n_potencia_inclinado,
           count(potencia_pv2_w)      AS n_potencia_vertical,
           count(*)                   AS filas
      FROM base
     GROUP BY 1
     ORDER BY 1
"""


def por_dia(ventana: Ventana) -> list[dict]:
    """Un renglon por dia CON FILAS de la ventana, ya sin las filas mezcladas.

    Es la unica consulta del modulo, y devuelve el dia entero (AC, DC y potencia)
    para que la energia AC del tablero y la DC por arreglo salgan de la MISMA
    lectura: dos consultas con filtros que se desincronizan dan dos verdades.
    """
    desde, hasta = ventana.sql
    return db.query(_SQL_POR_DIA, (desde, hasta, desde, hasta))

---
name: verificacion-numeros
description: Consultas SQL que reproducen las cifras del antes/después del ETL que muestra la consola; sirven para re-verificar cuando se re-corra el pipeline
categoria: datos
actualizado: 2026-08-21
tags: [supabase, etl, verificacion, sql]
---

# Re-verificar los números del ETL

La vista «Base de datos» de la consola muestra un **corte fechado** (corrida del 2026-08-10,
verificado contra la base el 2026-08-20). Cuando se re-corra el ETL, esas cifras hay que volver a
medirlas: son literales en `mvp-debugger/app/components/console/datos/catalogoDatos.ts`.

Estas consultas son lo que las produjo. Se guardan porque **no están en ningún lado del repo** y
porque encodan qué significa «corregido» en cada caso.

## Volumen y cobertura

```sql
SELECT 'monitoreo_sc_electrico' AS tabla, count(*), min(timestamp)::date, max(timestamp)::date FROM monitoreo_sc_electrico
UNION ALL SELECT 'radiacion_sc_15s',      count(*), min(timestamp)::date, max(timestamp)::date FROM radiacion_sc_15s
UNION ALL SELECT 'radiacion_sc_clearsky', count(*), min(timestamp)::date, max(timestamp)::date FROM radiacion_sc_clearsky
UNION ALL SELECT 'radiacion_sc_poa',      count(*), min(timestamp)::date, max(timestamp)::date FROM radiacion_sc_poa;
```

Al 2026-08-20: **36.469** eléctricas · **94.868** radiación · 94.868 clear-sky · 56.450 POA
(estas últimas desde 2025-09-05, no desde el inicio). `_ingest_log` tiene **285** filas, una por
CSV; `diccionario_variables`, 26.

## Crudo contra vista corregida

```sql
SELECT
  (SELECT count(*) FROM monitoreo_sc_electrico   WHERE temp_inclinado = 85 OR temp_vertical = 85) AS crudo_temp85,
  (SELECT count(*) FROM v_sc_electrico_corregido WHERE temp_inclinado = 85 OR temp_vertical = 85) AS corr_temp85,
  (SELECT max(potencia_pv1_w)    FROM monitoreo_sc_electrico)   AS crudo_pv1,
  (SELECT max(potencia_pv1_w)    FROM v_sc_electrico_corregido) AS corr_pv1,
  (SELECT max(potencia_total_wac) FROM monitoreo_sc_electrico)   AS crudo_ac,
  (SELECT max(potencia_total_wac) FROM v_sc_electrico_corregido) AS corr_ac,
  (SELECT count(*) FROM radiacion_sc_15s        WHERE irradiancia_incidente < 0) AS crudo_irrad_neg,
  (SELECT count(*) FROM v_sc_radiacion_corregida WHERE irradiancia_incidente < 0) AS corr_irrad_neg,
  (SELECT count(*) FROM v_sc_radiacion_corregida WHERE NOT valido)               AS pre_jul2025_nula;
```

Al 2026-08-20: temp 85 → **12.174 → 0** · PV1 → **26.503.163 W → 1.603 W** (26,5 MW en un arreglo
de 1.420 Wp: 18.664 veces lo instalado) · AC → **118.634 → 2.157 W** · irradiancia negativa →
**14.888 → 0** (mínimo crudo −15.538) · **37.825** filas anteriores a jul-2025 marcadas no válidas.
El offset exacto −38,845 aparece en **3.198** filas.

## Calibración y rendimiento

```sql
SELECT round((avg(CASE WHEN qc_ok THEN 1.0 ELSE 0.0 END)*100)::numeric,1) AS pct_qc_ok,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY kt_star)::numeric,2) AS kt_p95,
       round(max(irradiancia_incidente_wm2)::numeric,0) AS max_wm2
  FROM v_sc_radiacion_calibrada WHERE valido;

-- PR ENERGÉTICO (suma sobre suma), no el promedio de los PR instantáneos:
-- el promedio da 0,625 / 0,592 y NO converge, que es justo lo que hay que ver.
SELECT round((sum(potencia_pv1_w)/1420.0 / NULLIF(sum(poa_pv1_wm2)/1000.0,0))::numeric,3) AS pr_pv1,
       round((sum(potencia_pv2_w)/1420.0 / NULLIF(sum(poa_pv2_wm2)/1000.0,0))::numeric,3) AS pr_pv2
  FROM v_sc_performance
 WHERE poa_pv1_wm2 > 100 AND poa_pv2_wm2 > 100 AND potencia_pv1_w >= 0 AND potencia_pv2_w >= 0;
```

Al 2026-08-20: **99,0 %** pasa QC · kt\* p95 = **1,00** · máximo **1.340 W/m²** ·
PR energético **PV1 = 0,621 · PV2 = 0,626**. Que converjan es lo que valida el modelo bifacial.

Relacionado: [[implementacion]], [[geometria-sistema]], [[mvp-debugger]].

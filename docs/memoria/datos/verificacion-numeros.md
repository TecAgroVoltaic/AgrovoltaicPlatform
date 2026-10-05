---
name: verificacion-numeros
description: Consultas SQL que reproducen las cifras del antes/después del ETL que muestra la consola; sirven para re-verificar cuando se re-corra el pipeline. Incluye el corte del 2026-08-28, que corrigió cobertura por variable, cadencia real y energía
categoria: datos
actualizado: 2026-09-01
tags: [supabase, etl, verificacion, sql]
---

# Re-verificar los números del ETL

> ⚠️ **2026-09-01: TODAS las cifras de este archivo son de antes de la carga del 2026-09-01.** Ese
> día entraron 57 CSVs y la base pasó de 274 a **331 días** y de 36.469 a **45.270 filas eléctricas**
> ([[dataset-actual]]). **Las consultas siguen siendo válidas; los resultados guardados, no.** Antes
> de citar cualquier número de acá, hay que volver a correrlo. La lista de lo que quedó viejo y hay
> que re-medir está en [[abiertos]].

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
PR energético **PV1 = 0,621 · PV2 = 0,626**.

> ⚠️ **La lectura de esos dos PR cambió el 2026-08-28.** La consulta de arriba sigue siendo la
> correcta para reproducir lo que hay hoy en `v_sc_performance`, pero **esa vista une por
> timestamp exacto** y conserva **4.369 de 28.996 lecturas (15 %)**, con el 69 % de la muestra en
> octubre 2025 y mayo 2026. Emparejando por bin de 5 min (19.482 pares): **PV1 = 0,664 ·
> PV2 = 0,633**; por vecino más cercano dentro de ±150 s (19.251 pares): **0,665 y 0,634**. Los
> PR **no convergen** y **gana el inclinado**. La frase "que converjan valida el modelo bifacial"
> queda en revisión, ver [[emparejamiento-por-timestamp]]. Cuando se aplique
> `sql/002_performance_emparejado_por_bin.sql`, esta consulta hay que re-medirla.

## Corte del 2026-08-28: cobertura por variable, cadencia real y energía

Estas cifras salen de **consulta directa a la Supabase de producción el 2026-08-28** y corrigen
afirmaciones que la memoria daba por buenas. Re-medirlas si se re-corre el ETL.

```sql
-- Cobertura REAL por variable (valores NO NULOS), no el rango de la tabla
SELECT 'irradiancia_incidente' AS variable, count(*) AS n,
       min(timestamp)::date AS desde, max(timestamp)::date AS hasta
  FROM radiacion_sc_15s WHERE irradiancia_incidente IS NOT NULL
UNION ALL SELECT 'irradiancia_reflejada', count(*), min(timestamp)::date, max(timestamp)::date
  FROM radiacion_sc_15s WHERE irradiancia_reflejada IS NOT NULL
UNION ALL SELECT 'albedo', count(*), min(timestamp)::date, max(timestamp)::date
  FROM radiacion_sc_15s WHERE albedo IS NOT NULL;

-- Cadencia REAL: moda del salto entre filas consecutivas. NO usar intervalo_original_seg
SELECT date_trunc('month', timestamp) AS mes,
       mode() WITHIN GROUP (ORDER BY salto) AS moda_seg
  FROM (SELECT timestamp,
               extract(epoch FROM lead(timestamp) OVER (ORDER BY timestamp) - timestamp) AS salto
          FROM radiacion_sc_15s) t
 GROUP BY 1 ORDER BY 1;
```

**Cobertura por variable:** incidente **94.868** (2024-11-10 → 2026-06-01) · reflejada **39.822**
(**2025-10-25** → 2026-06-01) · albedo **39.777** (**2025-10-25** → 2026-06-01) · SP722, las cuatro
columnas, **360** (**2026-05-11 → 2026-05-28**, 18 días). Ver [[fuentes-fisicas]].

**Cadencia por mes:** 302 s (2024-11) · 2 s (2024-12) · 62 s (2025-05) · 31 s (2025-06) · 62 s
(2025-09) · **15 s (2025-10, el único mes realmente a 15 s)** · 315 s (2025-11 a 2026-02) · 300 s
(2026-03 a 2026-06). En `monitoreo_sc_electrico`, **35.101 de 36.468 saltos son exactamente
300 s** mientras `intervalo_original_seg` en esas mismas filas va de 2 a 330 s: esa columna es la
cadencia del CSV de origen, no la del dato guardado ([[muestreo-variable]]).

**Energía y huecos, mismo corte:** energía total **1.522,78 kWh** (inclinado **921,05** · vertical
**601,72**), integrando **potencia corregida** y no el acumulador del inversor (`energia_total_wh`
va de **182 a 39.328.367 Wh**, imposible para 2,84 kWp) · rendimiento específico del inclinado
**864 kWh/kWp/año** normalizando por días con datos (**416** por calendario; diciembre 2025, mes
completo, **896**) · **295 días sin datos en 26 tramos**, el mayor de **125 días** · completitud
eléctrica **0,444 contra calendario** y **0,926 sobre los días con registro** · último dato
**2026-06-01** (**88 días** de antigüedad, estado detenida). Ver [[gaps-temporales]].

## Corte del 2026-08-28: el store de hallazgos, tras correr el barrido completo

```sql
SELECT count(*) AS filas,
       count(DISTINCT tipo) AS tipos,
       count(DISTINCT fuente) AS fuentes
  FROM hallazgos_calidad;

SELECT severidad, count(*) FROM hallazgos_calidad GROUP BY 1 ORDER BY 2 DESC;
```

Al 2026-08-28, después del barrido completo: **23.533 filas · 23 tipos · 6 fuentes** (antes eran
3.158 y 10 tipos), repartidas en **4.071 graves · 8.498 avisos · 10.964 info**. El veredicto por
día quedó `ok=0 · aviso=16 · grave=258 · sin_datos=295`, y **cero días en verde no es un
resultado utilizable**: causas medidas y qué hacer con eso en [[store-hallazgos-calidad]].

## Corte del 2026-08-31: la energía AC del tablero

Medición de solo lectura que cierra la consulta 3 de [[respuestas-lcv-consultas-agosto]]. Las
consultas completas, con sus CTE, viven en `../../referencia/medicion-energia-ac.md`; acá van los
resultados que hay que poder reproducir.

| Qué | Valor al 2026-08-31 |
|---|---|
| `max(energia_total_wh)` sobre la tabla cruda | 39.328.367,1 (una sola fila, el `2025-10-07 07:45`) |
| `max(energia_total_wh)` excluyendo las filas con firma de contaminación | **2.710,7 kWh** |
| Recorrido del contador de vida | 182,3 (2024-11-10) a 2.710,7 (2026-06-01), **0 reinicios en 19.889 lecturas** |
| `energia_hoy_wh`, días con dato y suma de cierres | 270 días, **1.777,68 kWh** (269 y 1.640,43 sin el 2026-03-09) |
| `energia_pv1_wh` / `energia_pv2_wh`, días con dato | **144**, ninguno entre nov-2025 y feb-2026 |
| `energia_hoy_wh` entre nov-2025 y feb-2026 | **13.923 lecturas en 118 días** |
| Razón AC/DC contador contra contador | 129 días, mediana **0,958** (p05 0,944, p95 1,000) |
| Factor de unidad contra `potencia_total_wac` integrada | 127 días, mediana **1.003,58**, o sea **kWh y no Wh** |
| `v_sc_electrico_corregido` contra la cruda | **diferencia 0** en filas y en todos los máximos de energía |

⚠️ Estas cifras hay que re-medirlas si se arregla la vista o si se excluye el 2026-03-09: son un
corte fechado como el resto. Lectura completa en [[energia-ac-tablero]], las dos anomalías de la
vista en [[vista-corregida-no-corrige]] y la trampa de las unidades en [[unidades-energia-kwh]].

Relacionado: [[energia-ac-tablero]], [[unidades-energia-kwh]], [[vista-corregida-no-corrige]],
[[respuestas-lcv-consultas-agosto]],
[[implementacion]], [[geometria-sistema]], [[mvp-debugger]], [[fuentes-fisicas]],
[[muestreo-variable]], [[gaps-temporales]], [[catalogo-metricas-evaluacion]],
[[silencio-leido-como-salud]], [[store-hallazgos-calidad]],
[[emparejamiento-por-timestamp]], [[capa-analitica]].

-- Corrige el emparejamiento potencia <-> POA de `v_sc_performance`.
--
-- PROBLEMA. La vista unia las dos relaciones por TIMESTAMP EXACTO
-- (`JOIN radiacion_sc_poa USING ("timestamp")`). Las dos tablas tienen cadencias
-- distintas: lo electrico esta remuestreado a 5 min uniformes y la POA hereda la
-- cadencia irregular de la radiacion (15 a 330 s segun la epoca). El resultado es
-- que solo coinciden las filas en que las dos rejillas caen en el mismo instante.
--
-- Medido el 2026-08-28 sobre produccion: de 28.996 lecturas electricas posteriores
-- al inicio de la POA, el join exacto conservaba 4.369, o sea el 15%.
--
-- Y no era una perdida uniforme, que es lo que la vuelve grave. Porcentaje de
-- filas que sobrevivian al join exacto, por mes:
--
--     2025-09  30,3%      2025-12   4,4%      2026-03   4,7%
--     2025-10  45,4%      2026-01   4,7%      2026-04   4,0%
--     2025-11   5,0%      2026-02   4,7%      2026-05  52,9%
--
-- El 69% de la muestra salia de octubre 2025 y mayo 2026, los dos meses en que las
-- cadencias de los dos registradores se alineaban. El Performance Ratio "de todo el
-- historico" era en realidad el de esos dos meses.
--
-- CONSECUENCIA. El sesgo INVERTIA la comparacion que es el eje del proyecto:
--
--     join exacto      (4.369 pares)   PR PV1 0,622   PR PV2 0,626   -> gana el vertical
--     por bin de 5 min (19.482 pares)  PR PV1 0,664   PR PV2 0,633   -> gana el inclinado
--
-- Dos metodos de emparejamiento independientes convergen (tomar la muestra mas
-- cercana dentro de +-150 s da 0,665 / 0,634), asi que el resultado no depende del
-- metodo elegido.
--
-- SOLUCION. Promediar la POA sobre el MISMO bin de 5 minutos del dato electrico.
-- Se elige promediar por bin y no "la muestra mas cercana" porque la fila electrica
-- representa una ventana de cinco minutos, no un instante: emparejarla con el
-- promedio de la irradiancia de esa misma ventana es la comparacion homogenea.
--
-- `n_poa_bin` se expone para que el consumidor sepa cuantas muestras de POA
-- sostienen cada fila: en los tramos a 15 s son ~20 y en los de 5 min es 1, y esa
-- diferencia debe poder verse en vez de quedar escondida en el promedio.

DROP VIEW IF EXISTS v_sc_performance;

CREATE VIEW v_sc_performance AS
WITH poa_por_bin AS (
    SELECT date_bin('5 minutes', "timestamp", TIMESTAMPTZ '2024-01-01') AS bin,
           avg(poa_pv1_wm2)       AS poa_pv1_wm2,
           avg(poa_pv2_wm2)       AS poa_pv2_wm2,
           avg(poa_pv1_front_wm2) AS poa_pv1_front_wm2,
           avg(poa_pv2_front_wm2) AS poa_pv2_front_wm2,
           count(*)               AS n_poa_bin
      FROM radiacion_sc_poa
     GROUP BY 1
)
SELECT e."timestamp",
       e.potencia_pv1_w,
       e.potencia_pv2_w,
       p.poa_pv1_wm2,
       p.poa_pv2_wm2,
       p.poa_pv1_front_wm2,
       p.poa_pv2_front_wm2,
       p.n_poa_bin,
       CASE WHEN p.poa_pv1_wm2 > 100.0 AND e.potencia_pv1_w >= 0
            THEN (e.potencia_pv1_w / 1420.0) / (p.poa_pv1_wm2 / 1000.0) END AS pr_pv1,
       CASE WHEN p.poa_pv2_wm2 > 100.0 AND e.potencia_pv2_w >= 0
            THEN (e.potencia_pv2_w / 1420.0) / (p.poa_pv2_wm2 / 1000.0) END AS pr_pv2
  FROM v_sc_electrico_corregido e
  JOIN poa_por_bin p
    ON p.bin = date_bin('5 minutes', e."timestamp", TIMESTAMPTZ '2024-01-01');

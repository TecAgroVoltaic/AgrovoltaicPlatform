-- ============================================================================
--  002 · Normalizar el store ambiental (lossless)   ·   aplicada 2026-08-24
--
--  Problema. `lecturas_ambientales_sc` pesaba 353 MB (85 % de la cuota Free)
--  para guardar 885.606 floats. Formato largo con SIETE columnas de texto
--  repetidas en cada fila (~130 bytes) cuando en toda la tabla hay apenas ONCE
--  combinaciones distintas. Y los indices (192 MB) pesaban mas que los datos
--  (161 MB): `idx_lecturas_sensor_ts` eran 103 MB de btree sobre un texto de
--  once valores posibles.
--
--  Solucion. Separar la dimension (11 filas) de los hechos (885.606 filas).
--  NO se pierde ni un dato: mismas lecturas, mismos timestamps, mismos valores.
--    * `valor` sigue en DOUBLE PRECISION. Pasarlo a REAL ahorraba 4 bytes por
--      fila pero perturbaba 186.730 valores en el septimo digito, y la regla de
--      Leo es guardar el crudo.
--    * `origen_id` sobrevive como uuid (16 bytes en vez de 37 de texto) y SIN
--      indice, para no perder la trazabilidad hacia readings.id de AgroDash.
--    * La PK pasa de `origen_id` a `(serie_id, ts)`: se verifico que el par es
--      unico en las 885.606 filas, asi que la idempotencia del ETL se mantiene
--      y nos ahorramos un indice de 66 MB.
--
--  Resultado medido: la tabla 353 -> 88 MB, la base 415 -> 150 MB (90 % -> 30 %
--  del Free tier). Y con el cambio de data.py, la bajada del forecaster por
--  arranque en frio 56 -> 4,7 MB (11,8 veces menos egress).
--
--  ORDEN IMPORTANTE: los indices viejos se tiran ANTES de crear la tabla nueva.
--  Sin eso las dos copias conviviendo (415 + 88 MB) se pasaban del limite de
--  500 MB a mitad de migracion.
--
--  Se aplico en cuatro pasos (ver supabase_migrations.schema_migrations), con
--  el trasvase partido por serie para no chocar con el statement_timeout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 002a. Liberar espacio y crear el modelo. Los indices secundarios son
--       reconstruibles y ademas la tabla que los tiene se va: libera 126 MB.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_lecturas_sensor_ts;   -- 103 MB
DROP INDEX IF EXISTS idx_lecturas_var_ts;      --  23 MB

CREATE TABLE IF NOT EXISTS series_ambientales (
    serie_id    SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fuente      TEXT NOT NULL DEFAULT 'agrodash',
    caja        TEXT NOT NULL,
    variable    TEXT NOT NULL,
    sensor_type TEXT NOT NULL,
    sensor_id   UUID NOT NULL,
    unidad      TEXT,
    CONSTRAINT series_ambientales_natural_key
        UNIQUE NULLS NOT DISTINCT (fuente, caja, variable, sensor_type, sensor_id, unidad)
);
COMMENT ON TABLE series_ambientales IS
    'Dimension del store ambiental: 1 fila por canal fisico. Lo que antes se repetia en cada una de las 885.606 lecturas.';

CREATE TABLE IF NOT EXISTS lecturas_ambientales (
    serie_id    SMALLINT         NOT NULL REFERENCES series_ambientales (serie_id),
    ts          TIMESTAMPTZ      NOT NULL,
    ts_medicion TIMESTAMPTZ,
    valor       DOUBLE PRECISION,
    origen_id   UUID             NOT NULL,
    PRIMARY KEY (serie_id, ts)
);
COMMENT ON TABLE lecturas_ambientales IS
    'Store operativo del agente (hechos): data ambiental de San Carlos ingerida desde AgroDash. Cruda; la calibracion es aparte. La dimension esta en series_ambientales.';
COMMENT ON COLUMN lecturas_ambientales.origen_id IS
    'readings.id de AgroDash. Sin indice a proposito: es trazabilidad, no clave de busqueda. La idempotencia del ETL va por (serie_id, ts).';

INSERT INTO series_ambientales (fuente, caja, variable, sensor_type, sensor_id, unidad)
SELECT DISTINCT fuente, caja, variable, sensor_type, sensor_id::uuid, unidad
FROM lecturas_ambientales_sc
ON CONFLICT ON CONSTRAINT series_ambientales_natural_key DO NOTHING;

-- ----------------------------------------------------------------------------
-- 002b. Trasvasar los hechos. En la corrida real se partio por serie
--       (irradiancia entera; humedad en tres tandas) para no pasarse del
--       statement_timeout. ON CONFLICT DO NOTHING lo hace reintentable.
-- ----------------------------------------------------------------------------
INSERT INTO lecturas_ambientales (serie_id, ts, ts_medicion, valor, origen_id)
SELECT s.serie_id, l.ts, l.ts_medicion, l.valor, l.origen_id::uuid
FROM lecturas_ambientales_sc l
JOIN series_ambientales s
  ON  s.fuente      = l.fuente
  AND s.caja        = l.caja
  AND s.variable    = l.variable
  AND s.sensor_type = l.sensor_type
  AND s.sensor_id   = l.sensor_id::uuid
  AND s.unidad IS NOT DISTINCT FROM l.unidad
ON CONFLICT (serie_id, ts) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 002c. La tabla vieja se aparta (no se borra todavia) y el nombre pasa a una
--       vista que reproduce su forma exacta, para no romper a quien solo lee.
-- ----------------------------------------------------------------------------
ALTER TABLE lecturas_ambientales_sc RENAME TO lecturas_ambientales_sc_old;

CREATE OR REPLACE VIEW lecturas_ambientales_sc
WITH (security_invoker = true) AS
SELECT l.origen_id::text  AS origen_id,
       s.fuente,
       s.caja,
       s.variable,
       s.sensor_type,
       s.sensor_id::text  AS sensor_id,
       l.ts,
       l.ts_medicion,
       l.valor,
       s.unidad
FROM lecturas_ambientales l
JOIN series_ambientales   s USING (serie_id);
COMMENT ON VIEW lecturas_ambientales_sc IS
    'Compatibilidad: reproduce exactamente la tabla larga anterior a la normalizacion (002). Para escribir usar lecturas_ambientales + series_ambientales.';

-- El esquema public esta expuesto a PostgREST. La tabla vieja tenia RLS activo
-- (sin politicas), asi que su data NO era legible con la llave anon; sin esto
-- la normalizacion la habria abierto de contrabando.
ALTER TABLE lecturas_ambientales ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_ambientales   ENABLE ROW LEVEL SECURITY;

-- v_salud_ingesta siguio a la tabla en el RENAME y quedo apuntando a _old.
-- Se repunta. Se deja SECURITY DEFINER (sin security_invoker) a proposito:
-- es como estaba, y con RLS activo y cero politicas un invoker devolveria
-- 0 filas a todo el que no tenga BYPASSRLS.
CREATE OR REPLACE VIEW v_salud_ingesta AS
SELECT s.variable,
       max(l.ts)     AS ultimo_dato,
       count(*)      AS filas,
       round((EXTRACT(epoch FROM (now() - max(l.ts))) / 3600.0)::numeric, 2) AS edad_horas
FROM lecturas_ambientales l
JOIN series_ambientales   s USING (serie_id)
GROUP BY s.variable;

GRANT SELECT ON lecturas_ambientales, series_ambientales, lecturas_ambientales_sc,
                v_salud_ingesta TO joshua_ro;

ANALYZE series_ambientales;
ANALYZE lecturas_ambientales;

-- ----------------------------------------------------------------------------
-- 002d. Recien despues de verificar, se borra la tabla larga.
--
--       Lo que se verifico antes del DROP:
--         * 885.606 filas viejas = 885.606 nuevas, en las 11 series
--         * sumas exactas (numeric) identicas, diferencia maxima 0.00
--           (en DOUBLE PRECISION solo coincidian 5 de 11, por el ORDEN de la
--            suma en IEEE 754, no por diferencia de datos)
--         * hash por fila de (valor, ts_medicion) identico en las 11 series
--         * hash de origen_id identico en las 11 series
--         * EXCEPT en los dos sentidos sobre el canal que usa el forecaster: 0 y 0
--         * min(ts)/max(ts) identicos por serie
--         * 253 tests en verde y la serie que devuelve data.py identica
--         * backup local: sql/dump/lecturas_ambientales_sc_2026-08-24.csv.gz (28 MB)
--         * nada mas dependia de ella (v_salud_ingesta ya repuntada)
-- ----------------------------------------------------------------------------
DROP TABLE lecturas_ambientales_sc_old;

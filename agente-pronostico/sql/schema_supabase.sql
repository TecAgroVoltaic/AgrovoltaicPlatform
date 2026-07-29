-- ============================================================================
--  Esquema del AGENTE de pronóstico en la Supabase de AgroVoltaic
--  (project ref jijklguopafevyucogro, DB `postgres`).
--
--  Idempotente y evolutivo (CREATE IF NOT EXISTS): seguro de correr N veces.
--  Convive con `monitoreo_agrovoltaic` / `_ingest_log` sin tocarlas.
--
--  Separación de regiones: estas tablas son OPERATIVAS del agente (ingesta +
--  predicciones + logs). NO fusionan las DBs canónicas: `lecturas_ambientales_sc`
--  repatría a San Carlos su propia data ambiental (cajas con sufijo SC que hoy
--  viven en AgroDash/Cartago) para que el forecaster la consuma localmente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Store de lecturas ambientales (lo que trae el ETL desde AgroDash, crudo).
--    Formato LARGO: 1 fila = 1 lectura de 1 canal. PK = id de origen (readings.id
--    de AgroDash) -> upsert 1:1, idempotente aunque haya varias lecturas con el
--    mismo created_at (los inserts por lote comparten timestamp).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lecturas_ambientales_sc (
    origen_id    TEXT PRIMARY KEY,                 -- readings.id (uuid) de AgroDash
    fuente       TEXT        NOT NULL DEFAULT 'agrodash',
    caja         TEXT        NOT NULL,             -- box, p.ej. 'Caja Irradiancia SC'
    variable     TEXT        NOT NULL,             -- normalizado: 'irradiancia' | 'humedad_suelo'
    sensor_type  TEXT        NOT NULL,             -- type crudo de AgroDash ('irradiancia','humedad')
    sensor_id    TEXT        NOT NULL,             -- uuid del canal (desambigua sensores de una caja)
    ts           TIMESTAMPTZ NOT NULL,             -- created_at, etiquetado hora local (UTC-6)
    ts_medicion  TIMESTAMPTZ,                      -- timestamp_real si existe (a veces NULL)
    valor        DOUBLE PRECISION,                 -- valor CRUDO (sin calibrar)
    unidad       TEXT                              -- 'crudo' | 'adc' | 'W/m2' (cuando se calibre)
);
COMMENT ON TABLE lecturas_ambientales_sc IS
    'Store operativo del agente: data ambiental de San Carlos ingerida desde AgroDash (read-only). Cruda; la calibración es aparte.';

CREATE INDEX IF NOT EXISTS idx_lecturas_var_ts    ON lecturas_ambientales_sc (variable, ts DESC);
CREATE INDEX IF NOT EXISTS idx_lecturas_sensor_ts ON lecturas_ambientales_sc (sensor_id, ts DESC);

-- ----------------------------------------------------------------------------
-- 2. Predicciones (audit + write-back). Cada corrida del forecaster inserta 1 fila.
--    Habilita el análisis predicho-vs-real (semilla del Comparador).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predicciones (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),  -- cuándo se generó
    variable       TEXT        NOT NULL,
    ts_origen      TIMESTAMPTZ NOT NULL,                -- "ahora" del forecaster (último dato usado)
    ts_objetivo    TIMESTAMPTZ NOT NULL,                -- momento pronosticado (ts_origen + horizonte)
    horizonte_seg  INTEGER     NOT NULL,
    valor_esperado DOUBLE PRECISION,                    -- NULL = "no sé" (datos insuficientes)
    banda_bajo     DOUBLE PRECISION,
    banda_alto     DOUBLE PRECISION,
    unidad         TEXT,
    modelo         TEXT,                                -- 'smart_persistence_kt' | 'clima_persistencia' | ...
    frescura_seg   INTEGER,                             -- antigüedad del dato más reciente vs ts_origen
    n_muestras     INTEGER,                             -- lecturas útiles usadas
    latencia_ms    INTEGER,                             -- costo de cómputo
    origen         TEXT,                                -- 'visioneflow-schedule' | 'webhook' | 'hindcast'
    contexto       JSONB                                -- kt*, es_de_noche, advertencia, etc.
);
COMMENT ON TABLE predicciones IS
    'Audit de cada pronóstico del agente + write-back del flujo. Base de la validación predicho-vs-real.';

CREATE INDEX IF NOT EXISTS idx_predicciones_var_obj ON predicciones (variable, ts_objetivo);
CREATE INDEX IF NOT EXISTS idx_predicciones_creado  ON predicciones (creado_en DESC);

-- ----------------------------------------------------------------------------
-- 3. Log de eventos del agente (ETL + forecaster + flujo). Observabilidad.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agente_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
    componente TEXT        NOT NULL,                    -- 'etl' | 'forecaster' | 'flow'
    nivel      TEXT        NOT NULL DEFAULT 'info',     -- 'info' | 'warn' | 'error'
    evento     TEXT        NOT NULL,
    detalle    JSONB
);
COMMENT ON TABLE agente_log IS
    'Log estructurado de corridas/errores del agente (ETL, forecaster, flujo).';

CREATE INDEX IF NOT EXISTS idx_agente_log_ts ON agente_log (ts DESC);

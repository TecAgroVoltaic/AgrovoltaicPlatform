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

-- ----------------------------------------------------------------------------
-- 4. Consumo diario del LLM. UNA fila por (día UTC, modelo). Es la fuente de
--    verdad de dos cosas: el tope de presupuesto (`PRESUPUESTO_DIARIO_USD`) y
--    el acumulado que sirve `GET /uso`.
--
--    Vive acá y no en un JSON del contenedor por tres razones: ese JSON se
--    pierde cada vez que `forecast-refresh.timer` recrea el contenedor (cada
--    6 h) y el contenedor NO tiene volumen (`docker inspect` -> `Mounts: []`),
--    así que /app/data se va con la capa escribible; y con más de una instancia
--    cada proceso llevaría su propia cuenta, duplicando el tope en silencio.
--    Síntoma real: la consola mostraba 0 consultas y US$0 el mismo día que se
--    habían hecho 43. El día se corta en UTC.
--
--    Por qué `modelo` entra en la clave y no en un JSONB: sumar es trivial en
--    el upsert, la historia queda atribuida al cambiar de modelo sin migrar
--    nada, y el desglose sale con un GROUP BY en vez de con un merge de JSON.
--    Crecimiento acotado: ~365 filas por año y por modelo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uso_diario (
    fecha              DATE             NOT NULL,          -- día UTC
    modelo             TEXT             NOT NULL,          -- claude-haiku-4-5, etc.
    n_consultas        INTEGER          NOT NULL DEFAULT 0, -- turnos de usuario
    requests           INTEGER          NOT NULL DEFAULT 0, -- llamadas a la API (>= n_consultas por el lazo de tools)
    input_tokens       BIGINT           NOT NULL DEFAULT 0,
    output_tokens      BIGINT           NOT NULL DEFAULT 0,
    cache_read_tokens  BIGINT           NOT NULL DEFAULT 0, -- lo que el cache ahorró
    cache_write_tokens BIGINT           NOT NULL DEFAULT 0,
    web_searches       INTEGER          NOT NULL DEFAULT 0, -- tool de servidor de Anthropic
    usd                DOUBLE PRECISION NOT NULL DEFAULT 0,
    creado_en          TIMESTAMPTZ      NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (fecha, modelo)
);
COMMENT ON TABLE uso_diario IS
    'Consumo diario del LLM (1 fila por día UTC y modelo): tokens, consultas y USD. Fuente de verdad del tope de presupuesto y del acumulado que sirve GET /uso.';

-- ----------------------------------------------------------------------------
-- 5. Vistas de observabilidad. Existen para que "¿esto está sano?" se pueda
--    responder con UNA consulta, tanto desde el agente como desde psql o el
--    dashboard de Supabase, sin reimplementar la lógica en cada cliente.
--
--    La EDAD se calcula acá; el UMBRAL de "stale" NO: eso es política y vive en
--    la app (INGESTA_STALE_HORAS), para poder cambiarlo sin migrar la DB.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_salud_ingesta AS
SELECT variable,
       max(ts)                                                       AS ultimo_dato,
       count(*)                                                      AS filas,
       round((EXTRACT(EPOCH FROM (now() - max(ts))) / 3600.0)::numeric, 2) AS edad_horas
FROM lecturas_ambientales_sc
GROUP BY variable;

COMMENT ON VIEW v_salud_ingesta IS
    'Frescura de la ingesta por variable: último dato, filas y edad en horas. El umbral de stale lo decide la app.';

-- Últimos errores de cualquier componente (etl, forecaster, flujo). Es lo
-- primero que hay que mirar cuando algo se ve raro.
CREATE OR REPLACE VIEW v_agente_errores AS
SELECT ts, componente, evento, detalle->>'error' AS error, detalle
FROM agente_log
WHERE nivel = 'error'
ORDER BY ts DESC
LIMIT 50;

COMMENT ON VIEW v_agente_errores IS
    'Últimos 50 errores registrados por el agente (ETL, forecaster, flujo).';

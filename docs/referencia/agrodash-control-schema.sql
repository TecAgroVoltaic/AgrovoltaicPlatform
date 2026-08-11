-- ============================================================================
--  AgroDash — Estructura de tablas (DB `control`, idéntica a `agrodash_dev`)
--  Servidor: iot-mainserver  ·  Ubuntu  ·  PostgreSQL 14  ·  nativo
--  Extraído: 2026-06-16      ·  SOLO REFERENCIA (no ejecutar contra prod)
--
--  QUÉ ES:
--    Plataforma genérica de sensores de SUELO/AMBIENTE + control de riego
--    (filtro de Kalman) + experimentos agronómicos + alertas + multiusuario.
--    NO contiene datos fotovoltaicos (voltaje/corriente/potencia/inversor).
--
--  MODELO NÚCLEO:   boxes (punto de medición) -> sensors (type) -> readings (value)
--    * "caja" = punto de medición físico   (p.ej. "Caja Irradiancia SC")
--    * sufijo "SC" en el nombre de la caja = San Carlos: puntos creados por
--      el equipo de Cartago en San Carlos; varios sin reportar hace meses.
--
--  AVISOS DE CALIDAD (verificados 2026-06-16):
--    * sensors.type es TEXTO LIBRE y muy inconsistente (~63 valores):
--      EC/ec, P/p, temperatura/Temperature/Temperatura1..4,
--      irradiancia/Solar Radiation/radiacionPar  -> hay que normalizar.
--    * Cajas duplicadas por nombre: "Caja B" vs "Caja-B", etc.
--    * readings.timestamp_real suele venir NULL; created_at = hora de inserción.
--    * Timestamps SIN timezone (naive). min(created_at)=2011-01-01 (basura).
--    * Irradiancia llega CRUDA / sin calibrar (valores negativos ~ -1).
--    * ~19.4M filas en readings.
--
--  YA EXISTE del lado AgroDash (útil para el agente comparador):
--    * sensor_stats  -> media/desv 24h, anomaly_score, rate_of_change por sensor
--    * sensor_correlations -> pearson entre sensores del mismo tipo en una caja
--    * alert_rules / alert_ranges / alert_firings -> sistema de alertas
--
--  SEGURIDAD: del dump original se OMITIERON a propósito la PUBLICATION y la
--  SUBSCRIPTION de replicación lógica porque incluían una contraseña en claro.
--  (Rotar esa contraseña de Postgres.)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================================
-- 1. NÚCLEO — sensores y lecturas
-- ============================================================================

-- Punto de medición físico. OJO: hay nombres duplicados ("Caja B" / "Caja-B").
CREATE TABLE boxes (
    id   uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL UNIQUE
);

-- Sensor dentro de una caja. `type` es el tipo de variable (texto libre, sucio).
CREATE TABLE sensors (
    id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    box_id        uuid,                         -- FK -> boxes(id)
    sensor_number integer NOT NULL,
    type          text    NOT NULL,
    UNIQUE (box_id, sensor_number, type)
);

-- Lectura cruda. created_at = inserción; timestamp_real = medición (a veces NULL).
CREATE TABLE readings (
    id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    sensor_id      uuid,                                         -- FK -> sensors(id)
    value          numeric,
    created_at     timestamp DEFAULT now() NOT NULL,            -- sin timezone (naive)
    timestamp_real timestamp DEFAULT now()                      -- sin timezone (naive)
);

-- Estadísticos rodantes por sensor (¡ya trae anomaly_score!).
CREATE TABLE sensor_stats (
    sensor_id      uuid PRIMARY KEY,             -- FK -> sensors(id)
    computed_at    timestamptz DEFAULT now() NOT NULL,
    last_value     double precision,
    last_seen_at   timestamptz,
    mean_24h       double precision,
    stddev_24h     double precision,
    min_24h        double precision,
    max_24h        double precision,
    count_24h      integer,
    anomaly_score  double precision,
    rate_of_change double precision
);

-- Correlación (pearson) entre pares de sensores del mismo tipo en una caja.
CREATE TABLE sensor_correlations (
    box_id      uuid NOT NULL,                   -- FK -> boxes(id)
    sensor_type text NOT NULL,
    sensor_id_a uuid NOT NULL,                   -- FK -> sensors(id)
    sensor_id_b uuid NOT NULL,                   -- FK -> sensors(id)
    pearson_r   double precision NOT NULL,
    computed_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (sensor_id_a, sensor_id_b, sensor_type),
    CHECK (sensor_id_a < sensor_id_b)
);


-- ============================================================================
-- 2. ALERTAS
-- ============================================================================

CREATE TABLE alert_rules (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id         uuid NOT NULL,              -- FK -> users(id)
    team_id          uuid,                       -- FK -> teams(id)
    name             text NOT NULL,
    source_type      text NOT NULL,
    source_id        uuid,
    condition        jsonb NOT NULL,
    channels         jsonb DEFAULT '{"push": false, "in_app": true}'::jsonb NOT NULL,
    cooldown_minutes integer DEFAULT 60 NOT NULL,
    active           boolean DEFAULT true NOT NULL,
    created_at       timestamptz DEFAULT now() NOT NULL,
    CHECK (source_type IN ('sensor','experiment','process','infra'))
);

-- Rangos esperados por (caja, sensor, tipo) -> base del "está dentro del rango".
CREATE TABLE alert_ranges (
    id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    box_name      text NOT NULL,
    sensor_number integer NOT NULL,
    sensor_type   text NOT NULL,
    range_min     numeric NOT NULL,
    range_max     numeric NOT NULL,
    updated_at    timestamp DEFAULT now(),
    UNIQUE (box_name, sensor_number, sensor_type)
);

CREATE TABLE alert_firings (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_id    uuid NOT NULL,                    -- FK -> alert_rules(id)
    fired_at   timestamptz DEFAULT now() NOT NULL,
    value      jsonb,
    channel    text DEFAULT 'in_app' NOT NULL,
    recipients integer DEFAULT 1 NOT NULL
);


-- ============================================================================
-- 3. PROCESOS / RIEGO (control con filtro de Kalman)
-- ============================================================================

CREATE TABLE process_groups (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name        text NOT NULL,
    description text,
    color       text DEFAULT '#4a90d9' NOT NULL,
    owner_id    uuid NOT NULL,                   -- FK -> users(id)
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE processes (
    id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name               text NOT NULL,
    description        text,
    type               text DEFAULT 'irrigation_kalman' NOT NULL,
    status             text DEFAULT 'unknown' NOT NULL,
    control_url        text NOT NULL,
    api_key            text NOT NULL,
    config             jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_state         jsonb,
    last_seen_at       timestamptz,
    owner_id           uuid NOT NULL,            -- FK -> users(id)
    created_at         timestamptz DEFAULT now() NOT NULL,
    updated_at         timestamptz DEFAULT now() NOT NULL,
    group_id           uuid,                     -- FK -> process_groups(id)
    group_order        integer DEFAULT 0 NOT NULL,
    log_retention_days integer DEFAULT 30 NOT NULL,
    CHECK (status IN ('running','stopping','stopped','error','unknown'))
);

CREATE TABLE process_readings (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    process_id   uuid NOT NULL,                  -- FK -> processes(id)
    ts           timestamptz DEFAULT now() NOT NULL,
    raw          jsonb,
    filtered     jsonb,
    p_diag       jsonb,
    decision     double precision,
    actuator     text,
    pipeline_id  text DEFAULT '' NOT NULL,
    scope_values jsonb
);

CREATE TABLE process_valve_events (
    id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    process_id        uuid NOT NULL,             -- FK -> processes(id)
    ts                timestamptz DEFAULT now() NOT NULL,
    linea             text NOT NULL,
    estado            boolean NOT NULL,
    modo              text DEFAULT 'auto' NOT NULL,
    triggered_by      uuid,                      -- FK -> users(id)
    kalman_convergido boolean,
    kalman_x_hat      jsonb,
    context           jsonb,
    CHECK (modo IN ('auto','override','system'))
);

CREATE TABLE process_logs (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    process_id uuid NOT NULL,                    -- FK -> processes(id)
    ts         timestamptz DEFAULT now() NOT NULL,
    level      text DEFAULT 'info' NOT NULL,
    source     text DEFAULT 'system' NOT NULL,
    message    text NOT NULL,
    data       jsonb,
    user_id    uuid,                             -- FK -> users(id)
    CHECK (level  IN ('debug','info','warn','error')),
    CHECK (source IN ('control','user','system','worker'))
);

CREATE TABLE process_collaborators (
    process_id uuid NOT NULL,                    -- FK -> processes(id)
    user_id    uuid NOT NULL,                    -- FK -> users(id)
    role       text DEFAULT 'viewer' NOT NULL,
    added_at   timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (process_id, user_id),
    CHECK (role IN ('viewer','operator','admin'))
);

CREATE TABLE pipeline_states (
    process_id      uuid NOT NULL,               -- FK -> processes(id)
    pipeline_id     text NOT NULL,
    state           jsonb DEFAULT '{}'::jsonb NOT NULL,
    override_action jsonb,
    updated_at      timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (process_id, pipeline_id)
);

CREATE TABLE agent_cmd_results (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    process_id  uuid NOT NULL,                   -- FK -> processes(id)
    pipeline_id text NOT NULL,
    cmd         text NOT NULL,
    ok          boolean NOT NULL,
    message     text NOT NULL,
    data        jsonb,
    ts          timestamptz DEFAULT now() NOT NULL
);


-- ============================================================================
-- 4. EXPERIMENTOS (agronómicos)
-- ============================================================================

CREATE TABLE experiment_templates (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id         uuid NOT NULL,              -- FK -> users(id)
    name             text NOT NULL,
    description      text,
    public           boolean DEFAULT false NOT NULL,
    steps            jsonb DEFAULT '[]'::jsonb NOT NULL,
    constants_schema jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at       timestamptz DEFAULT now() NOT NULL,
    updated_at       timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE experiments (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id  uuid,                           -- FK -> experiment_templates(id)
    owner_id     uuid NOT NULL,                  -- FK -> users(id)
    title        text NOT NULL,
    description  text,
    public       boolean DEFAULT false NOT NULL,
    constants    jsonb DEFAULT '{}'::jsonb NOT NULL,
    status       text DEFAULT 'active' NOT NULL,
    created_at   timestamptz DEFAULT now() NOT NULL,
    updated_at   timestamptz DEFAULT now() NOT NULL,
    columns      jsonb DEFAULT '[]'::jsonb NOT NULL,
    schema_notes text,
    CHECK (status IN ('active','completed','archived'))
);

-- Grupos de definiciones (ej: "Franco Arenoso", "Arcilloso" -> texturas de suelo).
CREATE TABLE experiment_definition_groups (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    experiment_id uuid NOT NULL,                 -- FK -> experiments(id)
    name          text NOT NULL,
    description   text,
    color         text DEFAULT '#8a9bb0' NOT NULL,
    sort_order    integer DEFAULT 0 NOT NULL,
    created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE experiment_definitions (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    experiment_id uuid NOT NULL,                 -- FK -> experiments(id)
    key           text NOT NULL,
    type          text NOT NULL,
    label         text NOT NULL,
    payload       jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order    integer DEFAULT 0 NOT NULL,
    created_by    uuid,                          -- FK -> users(id)
    created_at    timestamptz DEFAULT now() NOT NULL,
    updated_at    timestamptz DEFAULT now() NOT NULL,
    var_type      text DEFAULT 'numeric',
    options       jsonb DEFAULT '[]'::jsonb,
    group_id      uuid,                          -- FK -> experiment_definition_groups(id)
    UNIQUE (experiment_id, key),
    CHECK (type     IN ('constant','expression','step','csv_schema','variable')),
    CHECK (var_type IN ('numeric','vector_csv','text','qualitative'))
);

CREATE TABLE experiment_events (
    id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    experiment_id     uuid NOT NULL,             -- FK -> experiments(id)
    step_key          text NOT NULL,
    event_type        text NOT NULL,
    soil_id           text,
    iteration         integer,
    data              jsonb DEFAULT '{}'::jsonb NOT NULL,
    note              text,
    recorded_at       timestamptz DEFAULT now() NOT NULL,
    corrects_event_id uuid,                      -- FK -> experiment_events(id)
    correction_reason text,
    recorded_by       uuid,                      -- FK -> users(id)
    is_voided         boolean DEFAULT false NOT NULL,
    group_id          uuid                       -- FK -> experiment_definition_groups(id)
);

-- Valores por columna por entry (una fila por entry_id + definition_key).
CREATE TABLE experiment_entry_values (
    id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    entry_id       uuid NOT NULL,                -- FK -> experiment_events(id)
    definition_key text NOT NULL,
    value_numeric  double precision,
    value_text     text,
    value_csv_path text,
    value_csv_data jsonb,
    created_at     timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE experiment_files (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    experiment_id uuid NOT NULL,                 -- FK -> experiments(id)
    step_key      text NOT NULL,
    filename      text NOT NULL,
    row_count     integer,
    columns       jsonb,
    parsed_data   jsonb,
    uploaded_at   timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE experiment_objectives (
    id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    experiment_id  uuid NOT NULL,                -- FK -> experiments(id)
    name           text NOT NULL,
    condition_type text NOT NULL,
    condition      jsonb NOT NULL,
    severity       text DEFAULT 'warning' NOT NULL,
    goto_ok        text,
    goto_violation text,
    sort_order     integer DEFAULT 0 NOT NULL,
    created_at     timestamptz DEFAULT now() NOT NULL,
    CHECK (condition_type IN ('range','expression')),
    CHECK (severity       IN ('info','warning','critical'))
);

CREATE TABLE experiment_series (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    experiment_id uuid NOT NULL,                 -- FK -> experiments(id)
    series_key    text NOT NULL,
    soil_id       text,
    value         double precision NOT NULL,
    unit          text,
    note          text,
    recorded_at   timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE experiment_collaborators (
    experiment_id uuid NOT NULL,                 -- FK -> experiments(id)
    user_id       uuid NOT NULL,                 -- FK -> users(id)
    role          text DEFAULT 'viewer' NOT NULL,
    added_by      uuid,                          -- FK -> users(id)
    added_at      timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (experiment_id, user_id),
    CHECK (role IN ('viewer','editor','admin'))
);


-- ============================================================================
-- 5. USUARIOS / EQUIPOS
-- ============================================================================

CREATE TABLE users (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email         text NOT NULL UNIQUE,
    display_name  text NOT NULL,
    password_hash text NOT NULL,
    role          text DEFAULT 'user' NOT NULL,
    created_at    timestamptz DEFAULT now() NOT NULL,
    must_change_pw boolean DEFAULT true NOT NULL,
    CHECK (role IN ('user','admin'))
);

CREATE TABLE teams (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name        text NOT NULL,
    description text,
    owner_id    uuid NOT NULL,                   -- FK -> users(id)
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE team_members (
    team_id     uuid NOT NULL,                   -- FK -> teams(id)
    user_id     uuid NOT NULL,                   -- FK -> users(id)
    role        text DEFAULT 'member' NOT NULL,
    status      text DEFAULT 'pending' NOT NULL,
    invited_by  uuid,                            -- FK -> users(id)
    invited_at  timestamptz DEFAULT now() NOT NULL,
    resolved_at timestamptz,
    PRIMARY KEY (team_id, user_id),
    CHECK (role   IN ('admin','member')),
    CHECK (status IN ('pending','accepted','rejected'))
);

CREATE TABLE team_resources (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id       uuid NOT NULL,                 -- FK -> teams(id)
    resource_type text NOT NULL,
    resource_id   uuid NOT NULL,
    role          text DEFAULT 'viewer' NOT NULL,
    assigned_at   timestamptz DEFAULT now() NOT NULL,
    UNIQUE (team_id, resource_type, resource_id),
    CHECK (resource_type IN ('experiment','process'))
);

CREATE TABLE invites (
    code       text PRIMARY KEY,
    created_by uuid NOT NULL,                    -- FK -> users(id)
    email_hint text,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    used_by    uuid                              -- FK -> users(id)
);

CREATE TABLE notifications (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    uuid NOT NULL,                    -- FK -> users(id)
    type       text NOT NULL,
    title      text NOT NULL,
    body       text,
    payload    jsonb,
    read       boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);


-- ============================================================================
-- 6. INFRAESTRUCTURA (monitoreo de los nodos)
-- ============================================================================

CREATE TABLE infra_timeseries (
    id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    source      text NOT NULL,
    ts          timestamptz NOT NULL,
    cpu         real,
    ram         real,
    disk        real,
    net_rx_kbps real,
    net_tx_kbps real
);

CREATE TABLE infra_node_stats (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source      text NOT NULL,
    reported_at timestamptz DEFAULT now() NOT NULL,
    payload     jsonb NOT NULL
);


-- ============================================================================
-- TRIGGER — notifica (LISTEN/NOTIFY) cuando entra una lectura de "Caja S"
-- ============================================================================

CREATE FUNCTION notify_nueva_lectura_caja_s() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
  box_name text;
BEGIN
  SELECT b.name INTO box_name
  FROM sensors s JOIN boxes b ON b.id = s.box_id
  WHERE s.id = NEW.sensor_id;

  IF box_name = 'Caja S' THEN
    PERFORM pg_notify('nueva_lectura_caja_s', 'sensor_id=' || NEW.sensor_id::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nueva_lectura_caja_s
    AFTER INSERT ON readings
    FOR EACH ROW EXECUTE FUNCTION notify_nueva_lectura_caja_s();


-- ============================================================================
-- FOREIGN KEYS  (al final por dependencias circulares)
-- ============================================================================

ALTER TABLE sensors                 ADD FOREIGN KEY (box_id)            REFERENCES boxes(id)                        ON DELETE CASCADE;
ALTER TABLE readings                ADD FOREIGN KEY (sensor_id)         REFERENCES sensors(id)                      ON DELETE CASCADE;
ALTER TABLE sensor_stats            ADD FOREIGN KEY (sensor_id)         REFERENCES sensors(id)                      ON DELETE CASCADE;
ALTER TABLE sensor_correlations     ADD FOREIGN KEY (box_id)            REFERENCES boxes(id)                        ON DELETE CASCADE;
ALTER TABLE sensor_correlations     ADD FOREIGN KEY (sensor_id_a)       REFERENCES sensors(id)                      ON DELETE CASCADE;
ALTER TABLE sensor_correlations     ADD FOREIGN KEY (sensor_id_b)       REFERENCES sensors(id)                      ON DELETE CASCADE;

ALTER TABLE alert_rules             ADD FOREIGN KEY (owner_id)          REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE alert_rules             ADD FOREIGN KEY (team_id)           REFERENCES teams(id)                        ON DELETE CASCADE;
ALTER TABLE alert_firings           ADD FOREIGN KEY (rule_id)           REFERENCES alert_rules(id)                  ON DELETE CASCADE;

ALTER TABLE processes               ADD FOREIGN KEY (owner_id)          REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE processes               ADD FOREIGN KEY (group_id)          REFERENCES process_groups(id)               ON DELETE SET NULL;
ALTER TABLE process_groups          ADD FOREIGN KEY (owner_id)          REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE process_readings        ADD FOREIGN KEY (process_id)        REFERENCES processes(id)                    ON DELETE CASCADE;
ALTER TABLE process_valve_events    ADD FOREIGN KEY (process_id)        REFERENCES processes(id)                    ON DELETE CASCADE;
ALTER TABLE process_valve_events    ADD FOREIGN KEY (triggered_by)      REFERENCES users(id)                        ON DELETE SET NULL;
ALTER TABLE process_logs            ADD FOREIGN KEY (process_id)        REFERENCES processes(id)                    ON DELETE CASCADE;
ALTER TABLE process_logs            ADD FOREIGN KEY (user_id)           REFERENCES users(id)                        ON DELETE SET NULL;
ALTER TABLE process_collaborators   ADD FOREIGN KEY (process_id)        REFERENCES processes(id)                    ON DELETE CASCADE;
ALTER TABLE process_collaborators   ADD FOREIGN KEY (user_id)           REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE agent_cmd_results       ADD FOREIGN KEY (process_id)        REFERENCES processes(id)                    ON DELETE CASCADE;

ALTER TABLE experiments             ADD FOREIGN KEY (owner_id)          REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE experiments             ADD FOREIGN KEY (template_id)       REFERENCES experiment_templates(id);
ALTER TABLE experiment_templates    ADD FOREIGN KEY (owner_id)          REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE experiment_definition_groups ADD FOREIGN KEY (experiment_id) REFERENCES experiments(id)                 ON DELETE CASCADE;
ALTER TABLE experiment_definitions  ADD FOREIGN KEY (experiment_id)     REFERENCES experiments(id)                  ON DELETE CASCADE;
ALTER TABLE experiment_definitions  ADD FOREIGN KEY (created_by)        REFERENCES users(id);
ALTER TABLE experiment_definitions  ADD FOREIGN KEY (group_id)          REFERENCES experiment_definition_groups(id) ON DELETE SET NULL;
ALTER TABLE experiment_events       ADD FOREIGN KEY (experiment_id)     REFERENCES experiments(id)                  ON DELETE CASCADE;
ALTER TABLE experiment_events       ADD FOREIGN KEY (corrects_event_id) REFERENCES experiment_events(id);
ALTER TABLE experiment_events       ADD FOREIGN KEY (group_id)          REFERENCES experiment_definition_groups(id) ON DELETE SET NULL;
ALTER TABLE experiment_events       ADD FOREIGN KEY (recorded_by)       REFERENCES users(id);
ALTER TABLE experiment_entry_values ADD FOREIGN KEY (entry_id)          REFERENCES experiment_events(id)            ON DELETE CASCADE;
ALTER TABLE experiment_files        ADD FOREIGN KEY (experiment_id)     REFERENCES experiments(id)                  ON DELETE CASCADE;
ALTER TABLE experiment_objectives   ADD FOREIGN KEY (experiment_id)     REFERENCES experiments(id)                  ON DELETE CASCADE;
ALTER TABLE experiment_series       ADD FOREIGN KEY (experiment_id)     REFERENCES experiments(id)                  ON DELETE CASCADE;
ALTER TABLE experiment_collaborators ADD FOREIGN KEY (experiment_id)    REFERENCES experiments(id)                  ON DELETE CASCADE;
ALTER TABLE experiment_collaborators ADD FOREIGN KEY (user_id)          REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE experiment_collaborators ADD FOREIGN KEY (added_by)         REFERENCES users(id);

ALTER TABLE teams                   ADD FOREIGN KEY (owner_id)          REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE team_members            ADD FOREIGN KEY (team_id)           REFERENCES teams(id)                        ON DELETE CASCADE;
ALTER TABLE team_members            ADD FOREIGN KEY (user_id)           REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE team_members            ADD FOREIGN KEY (invited_by)        REFERENCES users(id)                        ON DELETE SET NULL;
ALTER TABLE team_resources          ADD FOREIGN KEY (team_id)           REFERENCES teams(id)                        ON DELETE CASCADE;
ALTER TABLE invites                 ADD FOREIGN KEY (created_by)        REFERENCES users(id)                        ON DELETE CASCADE;
ALTER TABLE invites                 ADD FOREIGN KEY (used_by)           REFERENCES users(id);
ALTER TABLE notifications           ADD FOREIGN KEY (user_id)           REFERENCES users(id)                        ON DELETE CASCADE;


-- ============================================================================
-- ÍNDICES CLAVE (los más relevantes; en la DB viva hay ~50 índices)
-- ============================================================================

CREATE INDEX idx_readings_sensor_created_at ON readings (sensor_id, created_at DESC);
CREATE INDEX idx_readings_created_at        ON readings (created_at);
CREATE INDEX idx_sensor_stats_anomaly       ON sensor_stats (anomaly_score DESC NULLS LAST);
CREATE INDEX idx_alert_firings_rule         ON alert_firings (rule_id, fired_at DESC);
CREATE INDEX idx_process_readings_proc_ts   ON process_readings (process_id, pipeline_id, ts DESC);
CREATE INDEX idx_infra_ts_source_ts         ON infra_timeseries (source, ts DESC);
-- (PKs/UNIQUE generan sus propios índices; el resto son variantes por owner/experiment/etc.)

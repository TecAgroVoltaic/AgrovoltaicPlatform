-- GENERADO por agrovoltaic.ddl — NO editar a mano.

-- Regenerar desde el menú: opción 'Crear/actualizar tablas'.

-- Tabla principal (1 fila = 1 ventana de 5 min). La PK en timestamp ya

-- da indice btree para consultas por rango/dia.

CREATE TABLE IF NOT EXISTS monitoreo_agrovoltaic (
    timestamp                      TIMESTAMPTZ PRIMARY KEY,
    voltaje_pv1_v                  DOUBLE PRECISION,
    corriente_pv1_a                DOUBLE PRECISION,
    potencia_pv1_w                 DOUBLE PRECISION,
    voltaje_pv2_v                  DOUBLE PRECISION,
    corriente_pv2_a                DOUBLE PRECISION,
    potencia_pv2_w                 DOUBLE PRECISION,
    potencia_total_wac             DOUBLE PRECISION,
    frecuencia_hz                  DOUBLE PRECISION,
    voltaje_vac                    DOUBLE PRECISION,
    corriente_aac                  DOUBLE PRECISION,
    energia_hoy_wh                 DOUBLE PRECISION,
    energia_total_wh               DOUBLE PRECISION,
    energia_pv1_wh                 DOUBLE PRECISION,
    energia_pv2_wh                 DOUBLE PRECISION,
    temperatura_inversor_c         DOUBLE PRECISION,
    codigo_error                   DOUBLE PRECISION,
    irradiancia_incidente          DOUBLE PRECISION,
    irradiancia_reflejada          DOUBLE PRECISION,
    albedo                         DOUBLE PRECISION,
    temp_vertical                  DOUBLE PRECISION,
    temp_inclinado                 DOUBLE PRECISION,
    irradiancia_incidente_sp722    DOUBLE PRECISION,
    irradiancia_reflejada_sp722    DOUBLE PRECISION,
    detector_incidente_sp722_mv    DOUBLE PRECISION,
    detector_reflejado_sp722_mv    DOUBLE PRECISION,
    albedo_sp722                   DOUBLE PRECISION,
    tipo_fila                      TEXT,
    fuente_archivo                 TEXT,
    n_muestras                     INTEGER,
    intervalo_original_seg         INTEGER
);

-- Evolucion del schema: agrega columnas nuevas si la tabla ya existia.

ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS voltaje_pv1_v DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS corriente_pv1_a DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS potencia_pv1_w DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS voltaje_pv2_v DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS corriente_pv2_a DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS potencia_pv2_w DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS potencia_total_wac DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS frecuencia_hz DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS voltaje_vac DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS corriente_aac DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS energia_hoy_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS energia_total_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS energia_pv1_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS energia_pv2_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS temperatura_inversor_c DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS codigo_error DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS irradiancia_incidente DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS irradiancia_reflejada DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS albedo DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS temp_vertical DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS temp_inclinado DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS irradiancia_incidente_sp722 DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS irradiancia_reflejada_sp722 DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS detector_incidente_sp722_mv DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS detector_reflejado_sp722_mv DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS albedo_sp722 DOUBLE PRECISION;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS tipo_fila TEXT;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS fuente_archivo TEXT;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS n_muestras INTEGER;
ALTER TABLE monitoreo_agrovoltaic ADD COLUMN IF NOT EXISTS intervalo_original_seg INTEGER;

-- Control de ingesta (idempotencia por md5 de archivo)

CREATE TABLE IF NOT EXISTS _ingest_log (
    filename       TEXT PRIMARY KEY,
    md5            TEXT NOT NULL,
    rows           INTEGER,
    processed_at   TIMESTAMPTZ DEFAULT now()
);

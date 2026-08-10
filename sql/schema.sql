-- GENERADO por agrovoltaic.ddl — NO editar a mano. Regenerar desde el menu.

-- Modelo: crudo en tablas base + correccion en vistas (decision Leo 2026-08-10).

-- === Tabla ELECTRICA (crudo, 5 min) ===

CREATE TABLE IF NOT EXISTS monitoreo_sc_electrico (
    timestamp                        TIMESTAMPTZ PRIMARY KEY,
    voltaje_pv1_v                    DOUBLE PRECISION,
    corriente_pv1_a                  DOUBLE PRECISION,
    potencia_pv1_w                   DOUBLE PRECISION,
    voltaje_pv2_v                    DOUBLE PRECISION,
    corriente_pv2_a                  DOUBLE PRECISION,
    potencia_pv2_w                   DOUBLE PRECISION,
    potencia_total_wac               DOUBLE PRECISION,
    frecuencia_hz                    DOUBLE PRECISION,
    voltaje_vac                      DOUBLE PRECISION,
    corriente_aac                    DOUBLE PRECISION,
    energia_hoy_wh                   DOUBLE PRECISION,
    energia_total_wh                 DOUBLE PRECISION,
    energia_pv1_wh                   DOUBLE PRECISION,
    energia_pv2_wh                   DOUBLE PRECISION,
    temperatura_inversor_c           DOUBLE PRECISION,
    codigo_error                     DOUBLE PRECISION,
    temp_vertical                    DOUBLE PRECISION,
    temp_inclinado                   DOUBLE PRECISION,
    n_muestras                       INTEGER,
    intervalo_original_seg           INTEGER,
    fuente_archivo                   TEXT
);

ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS voltaje_pv1_v DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS corriente_pv1_a DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS potencia_pv1_w DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS voltaje_pv2_v DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS corriente_pv2_a DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS potencia_pv2_w DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS potencia_total_wac DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS frecuencia_hz DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS voltaje_vac DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS corriente_aac DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS energia_hoy_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS energia_total_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS energia_pv1_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS energia_pv2_wh DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS temperatura_inversor_c DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS codigo_error DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS temp_vertical DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS temp_inclinado DOUBLE PRECISION;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS n_muestras INTEGER;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS intervalo_original_seg INTEGER;
ALTER TABLE monitoreo_sc_electrico ADD COLUMN IF NOT EXISTS fuente_archivo TEXT;

-- === Tabla RADIACION (crudo, 15 s, base aparte) ===

CREATE TABLE IF NOT EXISTS radiacion_sc_15s (
    timestamp                        TIMESTAMPTZ PRIMARY KEY,
    irradiancia_incidente            DOUBLE PRECISION,
    irradiancia_reflejada            DOUBLE PRECISION,
    albedo                           DOUBLE PRECISION,
    irradiancia_incidente_sp722      DOUBLE PRECISION,
    irradiancia_reflejada_sp722      DOUBLE PRECISION,
    detector_incidente_sp722_mv      DOUBLE PRECISION,
    detector_reflejado_sp722_mv      DOUBLE PRECISION,
    albedo_sp722                     DOUBLE PRECISION,
    n_muestras                       INTEGER,
    intervalo_original_seg           INTEGER,
    fuente_archivo                   TEXT
);

ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS irradiancia_incidente DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS irradiancia_reflejada DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS albedo DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS irradiancia_incidente_sp722 DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS irradiancia_reflejada_sp722 DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS detector_incidente_sp722_mv DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS detector_reflejado_sp722_mv DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS albedo_sp722 DOUBLE PRECISION;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS n_muestras INTEGER;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS intervalo_original_seg INTEGER;
ALTER TABLE radiacion_sc_15s ADD COLUMN IF NOT EXISTS fuente_archivo TEXT;

-- === Clear-sky + POA (pvlib) para calibracion/QC y Performance Ratio ===

CREATE TABLE IF NOT EXISTS radiacion_sc_clearsky (
    timestamp      TIMESTAMPTZ PRIMARY KEY,
    cs_ghi_wm2     DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS radiacion_sc_poa (
    timestamp           TIMESTAMPTZ PRIMARY KEY,
    poa_pv1_front_wm2   DOUBLE PRECISION,
    poa_pv1_wm2         DOUBLE PRECISION,
    poa_pv2_front_wm2   DOUBLE PRECISION,
    poa_pv2_wm2         DOUBLE PRECISION
);

-- === Control de ingesta (idempotencia por md5) ===

CREATE TABLE IF NOT EXISTS _ingest_log (
    filename       TEXT PRIMARY KEY,
    md5            TEXT NOT NULL,
    rows           INTEGER,
    processed_at   TIMESTAMPTZ DEFAULT now()
);

-- === Diccionario de variables (Leo P1) ===

CREATE TABLE IF NOT EXISTS diccionario_variables (
    variable       TEXT PRIMARY KEY,
    descripcion    TEXT NOT NULL,
    tabla          TEXT
);
INSERT INTO diccionario_variables (variable, descripcion, tabla) VALUES
    ('voltaje_pv1_v', 'Voltaje del string PV1 (arreglo 1 = inclinado) [V]', 'electrico'),
    ('corriente_pv1_a', 'Corriente del string PV1 (arreglo 1 = inclinado) [A]', 'electrico'),
    ('potencia_pv1_w', 'Potencia del string PV1 (arreglo 1 = inclinado) [W]', 'electrico'),
    ('energia_pv1_wh', 'Energia del dia del arreglo PV1 (inclinado) [Wh]', 'electrico'),
    ('voltaje_pv2_v', 'Voltaje del string PV2 (arreglo 2 = vertical) [V]', 'electrico'),
    ('corriente_pv2_a', 'Corriente del string PV2 (arreglo 2 = vertical) [A]', 'electrico'),
    ('potencia_pv2_w', 'Potencia del string PV2 (arreglo 2 = vertical) [W]', 'electrico'),
    ('energia_pv2_wh', 'Energia del dia del arreglo PV2 (vertical) [Wh]', 'electrico'),
    ('potencia_total_wac', 'Potencia AC total del inversor (VA/Wac unificados) [W]', 'electrico'),
    ('voltaje_vac', 'Voltaje de salida AC del inversor [V]', 'electrico'),
    ('corriente_aac', 'Corriente de salida AC del inversor [A]', 'electrico'),
    ('frecuencia_hz', 'Frecuencia de la red [Hz]', 'electrico'),
    ('energia_hoy_wh', 'Energia AC generada en el dia [Wh]', 'electrico'),
    ('energia_total_wh', 'Energia AC acumulada historica [Wh]', 'electrico'),
    ('temperatura_inversor_c', 'Temperatura interna del inversor [C]', 'electrico'),
    ('codigo_error', 'Codigo de error/estado del inversor', 'electrico'),
    ('irradiancia_incidente', 'Irradiancia incidente, celda calibrada (CRUDA, sin escalar a W/m2)', 'radiacion'),
    ('irradiancia_reflejada', 'Irradiancia reflejada, celda calibrada (CRUDA)', 'radiacion'),
    ('albedo', 'Albedo = reflejada/incidente (celda calibrada)', 'radiacion'),
    ('temp_vertical', 'Temperatura del arreglo vertical (PV2), sensor DS18B20 [C]', 'electrico'),
    ('temp_inclinado', 'Temperatura del arreglo inclinado (PV1), sensor DS18B20 [C]', 'electrico'),
    ('irradiancia_incidente_sp722', 'Irradiancia incidente del piranometro SP722 (operativo desde may-2026)', 'radiacion'),
    ('irradiancia_reflejada_sp722', 'Irradiancia reflejada del piranometro SP722', 'radiacion'),
    ('detector_incidente_sp722_mv', 'Lectura cruda del detector incidente SP722 [mV]', 'radiacion'),
    ('detector_reflejado_sp722_mv', 'Lectura cruda del detector reflejado SP722 [mV]', 'radiacion'),
    ('albedo_sp722', 'Albedo del piranometro SP722', 'radiacion')
ON CONFLICT (variable) DO UPDATE SET descripcion = EXCLUDED.descripcion, tabla = EXCLUDED.tabla;

-- === Seguridad: RLS lockdown (solo roles de servicio; API publica bloqueada) ===

ALTER TABLE monitoreo_sc_electrico ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiacion_sc_15s ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiacion_sc_clearsky ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiacion_sc_poa ENABLE ROW LEVEL SECURITY;
ALTER TABLE diccionario_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE _ingest_log ENABLE ROW LEVEL SECURITY;

-- === Capa de correccion: vistas (el crudo NO se toca) ===

CREATE OR REPLACE VIEW v_sc_electrico_corregido WITH (security_invoker = on) AS
SELECT
    timestamp,
    CASE WHEN voltaje_pv1_v < 0.0 OR voltaje_pv1_v > 600.0 THEN NULL ELSE voltaje_pv1_v END AS voltaje_pv1_v,
    CASE WHEN corriente_pv1_a < 0.0 OR corriente_pv1_a > 20.0 THEN NULL ELSE corriente_pv1_a END AS corriente_pv1_a,
    CASE WHEN potencia_pv1_w < 0.0 OR potencia_pv1_w > 5000.0 THEN NULL ELSE potencia_pv1_w END AS potencia_pv1_w,
    CASE WHEN voltaje_pv2_v < 0.0 OR voltaje_pv2_v > 600.0 THEN NULL ELSE voltaje_pv2_v END AS voltaje_pv2_v,
    CASE WHEN corriente_pv2_a < 0.0 OR corriente_pv2_a > 20.0 THEN NULL ELSE corriente_pv2_a END AS corriente_pv2_a,
    CASE WHEN potencia_pv2_w < 0.0 OR potencia_pv2_w > 5000.0 THEN NULL ELSE potencia_pv2_w END AS potencia_pv2_w,
    CASE WHEN potencia_total_wac < 0.0 OR potencia_total_wac > 5000.0 THEN NULL ELSE potencia_total_wac END AS potencia_total_wac,
    CASE WHEN frecuencia_hz < 55.0 OR frecuencia_hz > 65.0 THEN NULL ELSE frecuencia_hz END AS frecuencia_hz,
    CASE WHEN voltaje_vac < 100.0 OR voltaje_vac > 280.0 THEN NULL ELSE voltaje_vac END AS voltaje_vac,
    corriente_aac,
    energia_hoy_wh,
    energia_total_wh,
    energia_pv1_wh,
    energia_pv2_wh,
    CASE WHEN temperatura_inversor_c = 85.0 OR temperatura_inversor_c < 10.0 OR temperatura_inversor_c > 80.0 THEN NULL ELSE temperatura_inversor_c END AS temperatura_inversor_c,
    codigo_error,
    CASE WHEN temp_vertical = 85.0 OR temp_vertical < 10.0 OR temp_vertical > 80.0 THEN NULL ELSE temp_vertical END AS temp_vertical,
    CASE WHEN temp_inclinado = 85.0 OR temp_inclinado < 10.0 OR temp_inclinado > 80.0 THEN NULL ELSE temp_inclinado END AS temp_inclinado,
    n_muestras,
    intervalo_original_seg,
    fuente_archivo
FROM monitoreo_sc_electrico;

CREATE OR REPLACE VIEW v_sc_radiacion_corregida WITH (security_invoker = on) AS
SELECT
    timestamp,
    CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_incidente - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_incidente < 0 THEN 0 ELSE irradiancia_incidente END AS irradiancia_incidente,
    CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_reflejada - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_reflejada < 0 THEN 0 ELSE irradiancia_reflejada END AS irradiancia_reflejada,
    CASE WHEN albedo < 0.0 OR albedo > 1.0 THEN NULL ELSE albedo END AS albedo,
    CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_incidente_sp722 - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_incidente_sp722 < 0 THEN 0 ELSE irradiancia_incidente_sp722 END AS irradiancia_incidente_sp722,
    CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_reflejada_sp722 - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_reflejada_sp722 < 0 THEN 0 ELSE irradiancia_reflejada_sp722 END AS irradiancia_reflejada_sp722,
    detector_incidente_sp722_mv,
    detector_reflejado_sp722_mv,
    CASE WHEN albedo_sp722 < 0.0 OR albedo_sp722 > 1.0 THEN NULL ELSE albedo_sp722 END AS albedo_sp722,
    (timestamp >= '2025-07-01'::timestamptz) AS valido,
    n_muestras,
    intervalo_original_seg,
    fuente_archivo
FROM radiacion_sc_15s;

-- === Capa de calibracion: radiacion en W/m2 + kt* + QC (usa clear-sky) ===

CREATE OR REPLACE VIEW v_sc_radiacion_calibrada WITH (security_invoker = on) AS
SELECT
    timestamp,
    (1.0 * (CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_incidente - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_incidente < 0 THEN 0 ELSE irradiancia_incidente END)) AS irradiancia_incidente_wm2,
    (1.0 * (CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_reflejada - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_reflejada < 0 THEN 0 ELSE irradiancia_reflejada END)) AS irradiancia_reflejada_wm2,
    CASE WHEN albedo < 0.0 OR albedo > 1.0 THEN NULL ELSE albedo END AS albedo,
    (1.0 * (CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_incidente_sp722 - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_incidente_sp722 < 0 THEN 0 ELSE irradiancia_incidente_sp722 END)) AS irradiancia_incidente_sp722_wm2,
    (1.0 * (CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_reflejada_sp722 - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_reflejada_sp722 < 0 THEN 0 ELSE irradiancia_reflejada_sp722 END)) AS irradiancia_reflejada_sp722_wm2,
    CASE WHEN albedo_sp722 < 0.0 OR albedo_sp722 > 1.0 THEN NULL ELSE albedo_sp722 END AS albedo_sp722,
    cs_ghi_wm2,
    CASE WHEN cs_ghi_wm2 > 20.0 THEN ((1.0 * (CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_incidente - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_incidente < 0 THEN 0 ELSE irradiancia_incidente END))) / cs_ghi_wm2 END AS kt_star,
    (((1.0 * (CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_incidente - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_incidente < 0 THEN 0 ELSE irradiancia_incidente END))) IS NULL OR ((1.0 * (CASE WHEN timestamp < '2025-07-01'::timestamptz THEN NULL WHEN abs(irradiancia_incidente - (-38.845008416418494)) < 1e-3 THEN 0 WHEN irradiancia_incidente < 0 THEN 0 ELSE irradiancia_incidente END))) <= GREATEST(1.3 * cs_ghi_wm2, 50)) AS qc_ok,
    (timestamp >= '2025-07-01'::timestamptz) AS valido,
    n_muestras,
    intervalo_original_seg,
    fuente_archivo
FROM radiacion_sc_15s LEFT JOIN radiacion_sc_clearsky USING (timestamp);

-- === Performance Ratio por arreglo (potencia vs POA bifacial) ===

CREATE OR REPLACE VIEW v_sc_performance WITH (security_invoker = on) AS
SELECT
    e.timestamp,
    e.potencia_pv1_w,
    e.potencia_pv2_w,
    p.poa_pv1_wm2,
    p.poa_pv2_wm2,
    p.poa_pv1_front_wm2,
    p.poa_pv2_front_wm2,
    CASE WHEN p.poa_pv1_wm2 > 100.0 AND e.potencia_pv1_w >= 0
         THEN (e.potencia_pv1_w / 1420.0) / (p.poa_pv1_wm2 / 1000.0) END AS pr_pv1,
    CASE WHEN p.poa_pv2_wm2 > 100.0 AND e.potencia_pv2_w >= 0
         THEN (e.potencia_pv2_w / 1420.0) / (p.poa_pv2_wm2 / 1000.0) END AS pr_pv2
FROM v_sc_electrico_corregido e JOIN radiacion_sc_poa p USING (timestamp);

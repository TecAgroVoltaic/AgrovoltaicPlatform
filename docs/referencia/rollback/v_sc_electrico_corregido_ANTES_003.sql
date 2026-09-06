-- Definicion de v_sc_electrico_corregido ANTES de aplicar 003, guardada el 2026-09-01.
-- Para revertir: CREATE OR REPLACE VIEW v_sc_electrico_corregido WITH (security_invoker = on) AS
-- seguido del cuerpo de abajo.

 SELECT "timestamp",
        CASE
            WHEN voltaje_pv1_v < 0.0::double precision OR voltaje_pv1_v > 600.0::double precision THEN NULL::double precision
            ELSE voltaje_pv1_v
        END AS voltaje_pv1_v,
        CASE
            WHEN corriente_pv1_a < 0.0::double precision OR corriente_pv1_a > 20.0::double precision THEN NULL::double precision
            ELSE corriente_pv1_a
        END AS corriente_pv1_a,
        CASE
            WHEN potencia_pv1_w < 0.0::double precision OR potencia_pv1_w > 5000.0::double precision THEN NULL::double precision
            ELSE potencia_pv1_w
        END AS potencia_pv1_w,
        CASE
            WHEN voltaje_pv2_v < 0.0::double precision OR voltaje_pv2_v > 600.0::double precision THEN NULL::double precision
            ELSE voltaje_pv2_v
        END AS voltaje_pv2_v,
        CASE
            WHEN corriente_pv2_a < 0.0::double precision OR corriente_pv2_a > 20.0::double precision THEN NULL::double precision
            ELSE corriente_pv2_a
        END AS corriente_pv2_a,
        CASE
            WHEN potencia_pv2_w < 0.0::double precision OR potencia_pv2_w > 5000.0::double precision THEN NULL::double precision
            ELSE potencia_pv2_w
        END AS potencia_pv2_w,
        CASE
            WHEN potencia_total_wac < 0.0::double precision OR potencia_total_wac > 5000.0::double precision THEN NULL::double precision
            ELSE potencia_total_wac
        END AS potencia_total_wac,
        CASE
            WHEN frecuencia_hz < 55.0::double precision OR frecuencia_hz > 65.0::double precision THEN NULL::double precision
            ELSE frecuencia_hz
        END AS frecuencia_hz,
        CASE
            WHEN voltaje_vac < 100.0::double precision OR voltaje_vac > 280.0::double precision THEN NULL::double precision
            ELSE voltaje_vac
        END AS voltaje_vac,
    corriente_aac,
    energia_hoy_wh,
    energia_total_wh,
    energia_pv1_wh,
    energia_pv2_wh,
        CASE
            WHEN temperatura_inversor_c = 85.0::double precision OR temperatura_inversor_c < 10.0::double precision OR temperatura_inversor_c > 80.0::double precision THEN NULL::double precision
            ELSE temperatura_inversor_c
        END AS temperatura_inversor_c,
    codigo_error,
        CASE
            WHEN temp_vertical = 85.0::double precision OR temp_vertical < 10.0::double precision OR temp_vertical > 80.0::double precision THEN NULL::double precision
            ELSE temp_vertical
        END AS temp_vertical,
        CASE
            WHEN temp_inclinado = 85.0::double precision OR temp_inclinado < 10.0::double precision OR temp_inclinado > 80.0::double precision THEN NULL::double precision
            ELSE temp_inclinado
        END AS temp_inclinado,
    n_muestras,
    intervalo_original_seg,
    fuente_archivo
   FROM monitoreo_sc_electrico;
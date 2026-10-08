import { Page, Note, IC, Table } from "@/app/docs/ui";

export function DatosEsquema() {
  return (
    <Page
      crumb="Datos · Supabase PV"
      title="Esquema de la base de datos"
      lead={<>El modelo vigente de la Supabase PV: dos tablas crudas + una capa de vistas que corrige y calibra sin destruir el dato original.</>}
    >
      <Note kind="crit">
        <div><b>Importante.</b> La tabla ancha <IC>monitoreo_agrovoltaic</IC> (modelo v1) <b>fue dropeada el 2026-08-10</b> junto con sus vistas <IC>v_inversor/v_irradiancia/v_temperatura</IC>. El modelo vivo son las dos tablas crudas + vistas que se describen abajo. El doc <IC>columnas-supabase.md</IC> describe el esquema viejo. La fuente de verdad es <IC>sql/schema.sql</IC>.</div>
      </Note>

      <h2>Regla rectora: crudo en la DB, corrección en capa de análisis</h2>
      <p>Validada por Leo Cardinale (2026-08-10): se <strong>guarda el valor crudo</strong> del sensor tal cual, y cada corrección genera una <strong>variable/columna corregida nueva</strong> en una vista SQL. Nunca se transforma in-place. Esto superó las decisiones previas de <IC>85→NULL</IC>, <IC>offset→0</IC> y «resamplear todo a 5 min».</p>

      <h2>Tablas crudas</h2>
      <p>Ambas con PK <IC>timestamp</IC> (TIMESTAMPTZ) y medidas en <IC>DOUBLE PRECISION</IC>. Cada fila lleva metadata de trazabilidad: <IC>n_muestras</IC>, <IC>intervalo_original_seg</IC>, <IC>fuente_archivo</IC>.</p>
      <h3><IC>monitoreo_sc_electrico</IC>: 1 fila = ventana de 5 min</h3>
      <Table
        head={["Columna", "Significado (crudo)"]}
        rows={[
          [<IC>voltaje_pv1_v · corriente_pv1_a · potencia_pv1_w</IC>, "DC del string PV1 (inclinado)"],
          [<IC>voltaje_pv2_v · corriente_pv2_a · potencia_pv2_w</IC>, "DC del string PV2 (vertical). voltaje_pv2_v ausente Dic 2024–May 2025"],
          [<IC>potencia_total_wac</IC>, "Potencia AC total del inversor"],
          [<IC>voltaje_vac · corriente_aac · frecuencia_hz</IC>, "Salida AC: voltaje de red, corriente AC, frecuencia"],
          [<IC>energia_hoy_wh · energia_total_wh</IC>, "Energía AC del día / acumulada histórica (acumuladores)"],
          [<IC>energia_pv1_wh · energia_pv2_wh</IC>, "Energía del día por arreglo (casi siempre vacías en datos recientes)"],
          [<IC>temperatura_inversor_c · codigo_error</IC>, "Temperatura interna del inversor y código de estado"],
          [<IC>temp_inclinado · temp_vertical</IC>, "Temperatura de panel PV1 / PV2 (DS18B20)"],
        ]}
      />
      <h3><IC>radiacion_sc_15s</IC>: 1 fila = ventana de 15 s (base aparte)</h3>
      <Table
        head={["Columna", "Significado (crudo)"]}
        rows={[
          [<IC>irradiancia_incidente · irradiancia_reflejada · albedo</IC>, "Celda calibrada, CRUDA, sin escalar a W/m²"],
          [<IC>irradiancia_incidente_sp722 · irradiancia_reflejada_sp722</IC>, "Piranómetro SP722 (operativo desde may-2026), W/m²"],
          [<IC>detector_incidente_sp722_mv · detector_reflejado_sp722_mv</IC>, "Lectura cruda de detectores SP722 (mV)"],
          [<IC>albedo_sp722</IC>, "Albedo del SP722"],
        ]}
      />

      <h2>Capa de corrección y calibración (vistas)</h2>
      <p>El crudo no se toca; todo se aplica en vistas (<IC>security_invoker=on</IC>). Son las relaciones que consulta el analizador.</p>
      <Table
        head={["Objeto", "Tipo", "Qué aplica"]}
        rows={[
          [<IC>v_sc_electrico_corregido</IC>, "vista", "temp = 85 o fuera de [10,80] → NULL; potencia fuera de [0,5000] → NULL; voltaje/corriente/frecuencia/vac a rango físico"],
          [<IC>v_sc_radiacion_corregida</IC>, "vista", "offset −38.845 → 0; negativos → 0; timestamp < 2025-07-01 → NULL + bandera valido; albedo [0,1]"],
          [<IC>radiacion_sc_clearsky</IC>, "tabla", "cs_ghi_wm2 por timestamp (pvlib Ineichen)"],
          [<IC>v_sc_radiacion_calibrada</IC>, "vista", "irradiancia_*_wm2 (escala 1.0), cs_ghi_wm2, kt_star, qc_ok, valido"],
          [<IC>radiacion_sc_poa</IC>, "tabla", "POA por arreglo (frontal + bifacial), pvlib"],
          [<IC>v_sc_performance</IC>, "vista", "pr_pv1, pr_pv2 = (P_dc / 1420) / (POA / 1000)"],
          [<IC>diccionario_variables</IC>, "tabla", "Definiciones y abreviaciones de cada variable"],
          [<IC>_ingest_log</IC>, "tabla", "Idempotencia por md5: filename (PK), md5, rows, processed_at"],
        ]}
      />
      <Note>
        <div><b>Seguridad.</b> RLS habilitado en lockdown (sin políticas): solo roles de servicio (postgres/service_role, BYPASSRLS) acceden; la API REST pública está bloqueada. El analizador entra por el Session pooler en solo-lectura.</div>
      </Note>
      <p>Los nombres «amigables» que verás en la consola (<IC>electrico_crudo</IC>, <IC>electrico_corregido</IC>, <IC>radiacion_15s_cruda</IC>, <IC>radiacion_calibrada</IC>, <IC>performance</IC>) son alias de una allowlist en <IC>datos.py</IC> que mapea a estas relaciones. Ningún nombre de tabla viene del cliente.</p>
    </Page>
  );
}

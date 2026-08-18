"use client";
import { Page, Note, IC, Table, Meta, Diagram } from "../ui";

export function DatosFuentes() {
  return (
    <Page
      crumb="Datos · Supabase PV"
      title="Fuentes físicas y geometría"
      lead="De qué sensores salen los datos crudos y cuál es la geometría real del sistema — el dato que desbloquea calibrar la irradiancia y calcular el Performance Ratio."
    >
      <h2>Tres fuentes físicas</h2>
      <p>Los CSV crudos combinan lecturas de tres fuentes que muestrean a intervalos distintos y a veces se intercalan mal en un mismo archivo.</p>
      <Table
        head={["Fuente", "Qué mide"]}
        rows={[
          [<><b>Inversor solar</b></>, "Dos strings PV1 y PV2: voltajes DC, corrientes DC, potencias DC. Salida AC (potencia total Wac, voltaje, corriente, frecuencia). Energía acumulada (día y total). Temperatura del inversor y código de error."],
          [<><b>Piranómetro / celda calibrada</b></>, <>Irradiancia incidente, reflejada y albedo (= reflejada/incidente). Desde <b>may-2026</b> se agrega un segundo sensor de referencia <IC>SP722</IC> (incidente/reflejada en W/m², detectores crudos en mV, albedo).</>],
          [<><b>Sensores DS18B20</b></>, <>Temperatura del panel en dos orientaciones: <IC>temp_inclinado</IC> (arreglo PV1) y <IC>temp_vertical</IC> (arreglo PV2).</>],
        ]}
      />
      <Note kind="warn">
        <div>La «celda calibrada» es un <b>nombre comercial</b> del sensor analógico — <b>no</b> viene ya escalado a W/m². Leo Cardinale confirmó que no se hizo ajuste. Por eso la irradiancia se calibra por modelo de cielo despejado, no con una constante guardada.</div>
      </Note>

      <h2>Geometría del sistema</h2>
      <p>Confirmada por Leo Cardinale el 2026-08-10 y codificada en <IC>src/agrovoltaic/config.py</IC>. Cierra los bloqueantes que impedían calibrar irradiancia y calcular PR.</p>
      <Table
        head={["String", "= Arreglo", "Geometría", "Potencia"]}
        rows={[
          [<IC>PV1</IC>, <><b>Inclinado</b></>, "tilt 20°, azimut 150° (≈ Sur-Sureste)", "4 × 355 Wp = 1420 Wp · bifacial"],
          [<IC>PV2</IC>, <><b>Vertical</b></>, "tilt 90°, azimut 50° (cara al norte)", "4 × 355 Wp = 1420 Wp · bifacial"],
        ]}
      />
      <Meta items={[
        ["Total instalado", "2840 Wp"],
        ["Latitud", "10.33"],
        ["Longitud", "−84.42"],
        ["Altitud", "600 m"],
        ["Azimut", "N=0°, horario+"],
        ["TZ", "America/Costa_Rica (UTC−6)"],
      ]} />
      <p>El total de 2840 Wp explica por qué los picos de «26,5 MW» en el crudo son físicamente imposibles: el sistema es de ~1–2 kW por string.</p>

      <Note kind="good">
        <div><b>Validación física del PR.</b> Con POA solo-frontal el arreglo vertical daba PR{">"}1 (imposible → es bifacial). Modelando la bifacialidad (dos planos, φ≈0,80), <b>ambos arreglos convergen a PR ≈ 0,62</b> (PV1=0,622 · PV2=0,626) — prueba de que comparten paneles, inversor y sitio.</div>
      </Note>
    </Page>
  );
}

export function DatosEsquema() {
  return (
    <Page
      crumb="Datos · Supabase PV"
      title="Esquema de la base de datos"
      lead={<>El modelo vigente de la Supabase PV: dos tablas crudas + una capa de vistas que corrige y calibra sin destruir el dato original.</>}
    >
      <Note kind="crit">
        <div><b>Importante.</b> La tabla ancha <IC>monitoreo_agrovoltaic</IC> (modelo v1) <b>fue dropeada el 2026-08-10</b> junto con sus vistas <IC>v_inversor/v_irradiancia/v_temperatura</IC>. El modelo vivo son las dos tablas crudas + vistas que se describen abajo. El doc <IC>columnas-supabase.md</IC> describe el esquema viejo — la fuente de verdad es <IC>sql/schema.sql</IC>.</div>
      </Note>

      <h2>Regla rectora: crudo en la DB, corrección en capa de análisis</h2>
      <p>Validada por Leo Cardinale (2026-08-10): se <strong>guarda el valor crudo</strong> del sensor tal cual, y cada corrección genera una <strong>variable/columna corregida nueva</strong> en una vista SQL. Nunca se transforma in-place. Esto superó las decisiones previas de <IC>85→NULL</IC>, <IC>offset→0</IC> y «resamplear todo a 5 min».</p>

      <h2>Tablas crudas</h2>
      <p>Ambas con PK <IC>timestamp</IC> (TIMESTAMPTZ) y medidas en <IC>DOUBLE PRECISION</IC>. Cada fila lleva metadata de trazabilidad: <IC>n_muestras</IC>, <IC>intervalo_original_seg</IC>, <IC>fuente_archivo</IC>.</p>
      <h3><IC>monitoreo_sc_electrico</IC> — 1 fila = ventana de 5 min</h3>
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
      <h3><IC>radiacion_sc_15s</IC> — 1 fila = ventana de 15 s (base aparte)</h3>
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

export function DatosPipeline() {
  return (
    <Page
      crumb="Datos · Supabase PV"
      title="Pipeline ETL y calidad de datos"
      lead="Cómo 285 CSV crudos, con 13 esquemas distintos y siete clases de problemas, se convierten en tablas limpias de forma idempotente e incremental."
    >
      <h2>El pipeline (src/agrovoltaic/)</h2>
      <p>Paquete Python con un entrypoint único: <IC>python3 main.py</IC> abre un menú (auditar · dry-run · generar DDL · subir tablas · cargar incremental / reprocesar todo). Conecta directo a Postgres (psycopg + Session pooler), no por la API REST.</p>
      <Diagram>{`  extract ─► transform ─► load ─► (refresh) clearsky + POA
    │           │           │
    │           │           └─ UPSERT por timestamp (ON CONFLICT DO UPDATE)
    │           └─ split eléctrico(5min) / radiación(15s); SIN limpiar
    └─ lee CSV ragged, normaliza headers al superset canónico`}</Diagram>
      <Table
        head={["Módulo", "Rol"]}
        rows={[
          [<IC>normalize.py</IC>, <><b>Corazón.</b> slugify() colapsa las ~70 variantes de nombres; CONCEPT_MAP = leyenda mínima slug→canónico, 1 entrada por concepto.</>],
          [<IC>schemas.py</IC>, "Deriva columnas canónicas, tags y método de resampleo desde CONCEPT_MAP. Partición eléctrico/radiación."],
          [<IC>extract.py</IC>, "Lee CSV tolerante a filas ragged, normaliza columnas, tipa a numérico, parsea timestamp."],
          [<IC>transform.py</IC>, "split_streams() separa por columnas; resamplea eléctrico a 5 min y radiación a 15 s (mean/last/first). Sin limpieza."],
          [<IC>clearsky.py · performance.py</IC>, "GHI de cielo despejado (pvlib Ineichen) y POA por arreglo con modelo bifacial."],
          [<IC>load.py · state.py</IC>, "UPSERT por timestamp; md5 en _ingest_log para saltar CSV sin cambios."],
          [<IC>pipeline.py</IC>, "Orquesta extract→transform→load; un archivo malo no frena el resto."],
        ]}
      />

      <h2>Idempotencia en dos niveles</h2>
      <ul>
        <li><strong>Nivel archivo:</strong> <IC>_ingest_log</IC> guarda el md5 → salta CSV sin cambios. Agregar datos = soltar el CSV y correr «cargar incremental».</li>
        <li><strong>Nivel fila:</strong> PK <IC>timestamp</IC> + <IC>ON CONFLICT DO UPDATE</IC> → reprocesar nunca duplica. «Reprocesar todo» hace TRUNCATE + recarga limpia.</li>
      </ul>
      <Note kind="good">
        <div><b>Cero columnas quemadas.</b> La única fuente irreducible es <IC>CONCEPT_MAP</IC>. Todo lo demás (columnas, tags, resampleo, DDL) se deriva. Columna nueva = 1 línea; variante ortográfica del mismo concepto → la reconoce <IC>slugify</IC> sin tocar código.</div>
      </Note>
      <Meta items={[
        ["Corrida vigente", "36.469 filas eléctricas"],
        ["", "94.868 filas de radiación"],
        ["Fuente", "285 CSV (2024-11-10 → 2026-06-01)"],
        ["Fallos", "0"],
      ]} />

      <h2>Las 7 inconsistencias del crudo</h2>
      <p>Verificadas contando evidencia en la carpeta NEW (2026-06-01). Son la razón de ser de todo el pipeline.</p>
      <Table
        head={["#", "Problema", "Evidencia"]}
        rows={[
          ["1", "13 esquemas / nombres inconsistentes", "12 headers exactos coexisten; misma variable como vpv1 / Voltaje PV1 [V] / voltaje_pv1_v"],
          ["2", "Filas mezcladas (grave)", "8 archivos con filas de distinto nº de columnas; irradiancia cae en columnas de «Voltaje PV1»"],
          ["3", "Irradiancia sin calibrar", "offset −38.845 en 205 archivos; mínimos hasta −15.538; SP722 casi siempre vacío"],
          ["4", "Temperaturas saturadas 85 °C", "85.0 = valor de error del DS18B20 desconectado; en 137 archivos"],
          ["5", "Intervalo de muestreo variable", "Dic-2024 ~2 s · May-2025 ~1 min · Nov-2025+ ~5 min"],
          ["6", "Gaps temporales", "126 días (Dic 2024→May 2025) y 71 días (Jun→Sep 2025)"],
          ["7", "Duplicados y fragmentos (N)", "2 duplicados exactos por MD5; fragmentos diminutos de 86–87 bytes"],
        ]}
      />
      <p>Extra: typos en headers — <IC>Energì</IC> (acento grave) en 72 archivos, <IC>POTencia</IC> en 2, <IC>Corriente PV2[A]</IC> sin espacio en 5.</p>

      <h2>Decisiones de datos (Leo Cardinale, 2026-08-10)</h2>
      <Table
        head={["Decisión", "Detalle"]}
        rows={[
          ["Crudo + corrección en capa", "Cada corrección genera una variable corregida nueva (vistas SQL). No se transforma in-place."],
          ["Muestreo", "Eléctricas a 5 min; radiación a 15 s en tabla aparte (ThingSpeak no permite <15 s). Muestreos <10 s = pruebas."],
          ["Temperatura válida 10–80 °C", "Reemplaza el −10…60 °C de AgroDash. Causa física del 85 °C: falso contacto del sensor."],
          ["Offset −38.845 = normal", "Asunto de calibración + ruido eléctrico. Se deja crudo, se corrige en análisis."],
          ["Calibración clear-sky (pvlib)", "No hay constante guardada. Se calibra por modelo de cielo despejado con lat/lon + tilt/azimut."],
          ["Descartar irradiancia pre-mediados-2025", "Error de medición corregido a mediados 2025 (vista: timestamp < 2025-07-01 → NULL). SP722 desde may-2026."],
          ["Filas mezcladas: recuperar lo posible", "Con la regla de remapeo (header 19 cols: L/M/N = irradiancia, O = timestamp). Aceptar huecos."],
          ["Gaps largos: sin datos sintéticos", "126 y 71 días → usar NASA POWER como referencia paralela."],
        ]}
      />
    </Page>
  );
}

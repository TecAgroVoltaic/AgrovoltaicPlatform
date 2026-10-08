import { Page, Note, IC, Table, Meta, Diagram } from "@/app/docs/ui";

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
      <p>Extra: typos en headers. <IC>Energì</IC> (acento grave) en 72 archivos, <IC>POTencia</IC> en 2, <IC>Corriente PV2[A]</IC> sin espacio en 5.</p>

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

"use client";
import { Page, Note, IC, Table, Meta, Pre, Diagram } from "../ui";

export function Analizador() {
  return (
    <Page
      crumb="Agente Analizador PV"
      title="Analizador PV"
      lead="Agente de preguntas y respuestas sobre el histórico fotovoltaico de San Carlos. El LLM solo orquesta; los números salen siempre de herramientas que hacen SQL de solo-lectura sobre las vistas ya limpias."
    >
      <Meta items={[
        ["Framework", "FastAPI"],
        ["Puerto", "8010"],
        ["Modelo", "claude-haiku-4-5"],
        ["max_tokens", "2048"],
        ["Entrypoint", "analizador.api:app"],
        ["Fuente", "Supabase PV (RO)"],
      ]} />

      <h2>El lazo del agente</h2>
      <p>Clase <IC>Analizador</IC> (<IC>agent/agent.py</IC>): tool-use manual con el SDK de Anthropic (no el tool-runner beta) para control total y no filtrar el razonamiento interno. El agente se construye de forma <strong>perezosa</strong> en el primer <IC>/preguntar</IC> o <IC>/chat</IC> — así <IC>/health</IC> y <IC>/tool</IC> no dependen de la <IC>ANTHROPIC_API_KEY</IC>.</p>
      <p>La <strong>barrera anti-invención</strong> es estructural + de prompt: el modelo no tiene acceso a la DB (toda cifra pasa por el <IC>DISPATCH</IC> de tools) y el system prompt ordena «NUNCA calcules ni inventes números». La comparación PV1 vs PV2 no necesita tool dedicada: <IC>performance_ratio</IC>, <IC>energia_por_arreglo</IC> y <IC>temperatura_por_arreglo</IC> ya devuelven ambos arreglos en una sola llamada.</p>

      <h2>Herramientas (8)</h2>
      <p>Registro en <IC>tools/__init__.py</IC>: cada módulo expone un <IC>SCHEMA</IC> (lo que ve el LLM) y un <IC>run(**params)</IC>. Las 6 atómicas comparten firma <IC>run(desde?, hasta?)</IC>.</p>
      <Table
        head={["Tool", "Devuelve", "Relación DB"]}
        rows={[
          [<IC>energia_por_arreglo</IC>, "Energía Wh de PV1, PV2 y AC total (Σ potencia × 5/60)", <IC>v_sc_electrico_corregido</IC>],
          [<IC>performance_ratio</IC>, "PR de PV1 y PV2 (ponderado por energía, P0 = 1420 Wp)", <IC>v_sc_performance</IC>],
          [<IC>irradiancia_resumen</IC>, "GHI media/máx, kt* medio, insolación (Wh/m²)", <IC>v_sc_radiacion_calibrada</IC>],
          [<IC>temperatura_por_arreglo</IC>, "Temp media/máx por arreglo (inclinado / vertical)", <IC>v_sc_electrico_corregido</IC>],
          [<IC>cobertura_datos</IC>, "Rango disponible + conteo de filas eléctricas y de radiación", <>crudas + <IC>_15s</IC></>],
          [<IC>catalogo_variables</IC>, "Diccionario de variables (nombre, descripción, tabla)", <IC>diccionario_variables</IC>],
          [<IC>graficar</IC>, <>Serie completa + resumen; incluye marcador <IC>_grafico</IC> para pintar inline</>, "vía datos.serie(...)"],
          [<IC>tendencia</IC>, <>Versión <b>lean</b> de graficar: solo el resumen (min/max/media), sin arrays</>, "vía datos.serie(...)"],
        ]}
      />
      <p>El enum <IC>metrica</IC> (que comparten <IC>graficar</IC> y <IC>tendencia</IC>) acepta <IC>potencia</IC>, <IC>irradiancia</IC>, <IC>kt</IC>, <IC>pr</IC>, <IC>temperatura</IC>, con <IC>bucket</IC> ∈ day/week/month.</p>
      <Note>
        <div><b>El marcador <IC>_grafico</IC>.</b> <IC>graficar</IC> devuelve <IC>{"{tipo, titulo, unidad, x[], series[{nombre, valores[]}]}"}</IC>. El lazo del chat lo <b>elimina antes de mandárselo al LLM</b> (ahorra tokens) pero lo deja en la traza para que el widget lo pinte. Cero invención: el gráfico ES la salida de una tool.</div>
      </Note>

      <h2>Endpoints HTTP</h2>
      <p>Definidos en <IC>api.py</IC>. Los marcados exigen <IC>x-api-key</IC> solo si <IC>ANALIZADOR_API_KEY</IC> está en el entorno (comparación en tiempo constante).</p>
      <Table
        head={["Método · Path", "Auth", "Qué hace"]}
        rows={[
          [<IC>GET /health</IC>, "abierto", "Ping + lista de tools"],
          [<IC>GET /tools</IC>, "abierto", "Esquemas de las tools (para cablear httpRequestTool en VisioneFlow)"],
          [<IC>POST /tool/{"{nombre}"}</IC>, "sí", "Ejecuta una tool atómica con el body como params (sin LLM)"],
          [<IC>POST /preguntar</IC>, "sí", "Corre el lazo LLM completo y devuelve la traza"],
          [<IC>POST /chat</IC>, "sí", "Turno multi-turno del widget: historial + contexto → respuesta + traza (con web search)"],
          [<IC>GET /uso</IC>, "sí", "Consumo acumulado (tokens + USD + nº consultas, por modelo)"],
          [<IC>GET /datos/tablas</IC>, "sí", "Cobertura de todas las relaciones (conteo + rango) en 1 consulta"],
          [<IC>GET /datos/columnas</IC>, "sí", "Esquema (columnas + tipos) de una relación de la allowlist"],
          [<IC>GET /datos/muestra</IC>, "sí", "Últimas/primeras filas crudas de una relación"],
          [<IC>GET /datos/serie</IC>, "sí", "Serie temporal agregada de una columna (bucket + agg)"],
        ]}
      />

      <h2>Conexión a datos</h2>
      <p>Pool <IC>psycopg_pool.ConnectionPool</IC> (perezoso, <IC>min=1, max=6</IC>) forzado a <strong>solo-lectura</strong> (<IC>SET SESSION ... READ ONLY</IC>). Motivo: abrir conexión al pooler de Supabase cuesta ~700 ms; reusar evita pagarlo por request. El commit <IC>4261062</IC> («pool + cobertura en 1 consulta») bajó una consulta de 8 s a 0,3 s.</p>
      <Note>
        <div><b>Chat con web search.</b> <IC>/chat</IC> añade la server-tool <IC>web_search</IC> (máx. 3 usos) para contexto externo con cita, y usa prompt caching (system + última tool cacheados). El contexto de la vista se inyecta fuera de la parte cacheada para no romper la caché al cambiar de filtro.</div>
      </Note>
    </Page>
  );
}

export function Pronostico() {
  return (
    <Page
      crumb="Agente Pronóstico"
      title="Pronóstico ambiental"
      lead="Agente que pronostica irradiancia y humedad de suelo a corto plazo, y reconstruye honestamente el pasado (backtest). No usa machine learning: usa física del cielo despejado."
    >
      <Meta items={[
        ["Framework", "FastAPI"],
        ["Puerto", "8000"],
        ["Modelo", "claude-haiku-4-5"],
        ["Horizonte", "1 min – 6 h"],
        ["Fuente", "AgroDash → store Supabase"],
      ]} />

      <h2>Qué pronostica</h2>
      <Table
        head={["Variable", "Unidad", "Modelo"]}
        rows={[
          [<IC>irradiancia</IC>, "W/m²", "Persistencia inteligente de kt* × cielo despejado"],
          [<IC>humedad_suelo</IC>, "crudo (ADC 16-bit, 0–65535)", "Persistencia de la mediana reciente"],
        ]}
      />

      <h2>Método: persistencia de kt* (no es ML)</h2>
      <p>Se apoya en la descomposición física <IC>GHI_medida = kt* × GHI_cielo-despejado</IC>, donde <IC>kt*</IC> (índice de claridad) aísla el efecto de las nubes de la geometría solar, que es astronómica y perfectamente predecible.</p>
      <Diagram>{`  1. kt* de los últimos 60 min   (solo lecturas con timestamp < now → sin fuga)
  2. kt*_pred = MEDIANA de esos kt*   (robusta; las nubes «persisten»)
  3. GHI_pred(now+h) = kt*_pred × GHI_cielo-despejado(now+h)
                                      └─ geometría solar FUTURA (lícita)`}</Diagram>
      <ul>
        <li>Cielo despejado: modelo <strong>Ineichen</strong> de pvlib con turbidez Linke climatológica.</li>
        <li>De noche (cielo despejado ≤ 20 W/m²) el valor es exactamente <IC>0.0</IC>.</li>
        <li>Banda de incertidumbre: ±1σ de kt* reciente reconstruido a GHI.</li>
        <li>El «ahora» por defecto es el <strong>último timestamp del store</strong>, no el reloj de pared.</li>
        <li><IC>parse_horizon("dos horas") → 7200</IC> es determinista (sin LLM) y es la fuente de verdad del horizonte.</li>
      </ul>
      <p>La humedad de suelo persiste la <strong>mediana</strong> de lecturas recientes (el suelo cambia lento y es muy autocorrelacionado); no tiene análogo de cielo despejado.</p>

      <h2>Dos modalidades: pronóstico vs. backtest</h2>
      <Table
        head={["", "Pronóstico a futuro", "Backtest histórico"]}
        rows={[
          ["Qué es", "Desde el «ahora» hacia adelante (≤ 6 h)", "«Cómo habría predicho» una fecha pasada vs. lo medido"]        ,
          ["Dispara", <><IC>POST /forecast</IC> o la tool forecast</>, <><IC>GET /backtest</IC> o la tool backtest (solo en /chat)</>],
          ["Datos", "get_recent_data(now, 60min), barrera timestamp < now", "la MISMA serie del store, remuestreada, con .shift(1)"],
          ["Es predicción real", "sí", "no — evalúa el método"],
        ]}
      />
      <Note kind="warn">
        <div>El backtest <b>reaplica el método</b> sobre el histórico real; por eso la vista «Predicción vs Real» de la consola aclara que <b>no son predicciones en vivo</b>. Las métricas: <IC>mae</IC>, <IC>bias</IC>, <IC>error_rel_pct</IC> y <IC>skill_pct</IC> (mejora sobre el baseline «igual que antes»).</div>
      </Note>

      <h2>Herramientas</h2>
      <Table
        head={["Tool", "Disponible en", "Notas"]}
        rows={[
          [<IC>forecast</IC>, "/preguntar y /chat", "run_forecast(variable, horizon_seconds, horizonte_texto?)"],
          [<IC>backtest</IC>, "solo /chat", <>Genera <IC>_grafico</IC> (Real vs Reconstrucción) para pintar inline</>],
          [<IC>web_search</IC>, "solo /chat", "Server-tool de Anthropic (máx. 3 usos), para conocimiento externo con cita"],
        ]}
      />

      <h2>Endpoints HTTP</h2>
      <Table
        head={["Método · Path", "Qué hace"]}
        rows={[
          [<IC>GET /health</IC>, "Ping (abierto, sin key)"],
          [<IC>POST /forecast</IC>, "Pronóstico directo. Hace write-back a la tabla predicciones (auditoría)"],
          [<IC>GET /backtest</IC>, "Reconstrucción honesta (variable, dias, bucket, desde/hasta)"],
          [<IC>POST /anomalias</IC>, "Detección determinista (outliers, drift, stuck, outage, fuera_rango)"],
          [<IC>GET /serie</IC>, "Peek de una serie del store para graficar"],
          [<IC>POST /preguntar</IC>, "Lazo LLM (solo tool forecast) → traza"],
          [<IC>POST /chat</IC>, "Turno multi-turno del widget (forecast + backtest + web) → traza"],
          [<IC>GET /uso</IC>, "Consumo acumulado"],
        ]}
      />
      <p>Todo (salvo <IC>/health</IC>) exige <IC>x-api-key</IC> solo si <IC>FORECAST_API_KEY</IC> está definida. Límites del horizonte: 60 s – 21600 s.</p>

      <h2>Fuentes de datos</h2>
      <p>Arquitectura de dos DBs: una <strong>fuente</strong> que el ETL lee y un <strong>store</strong> donde el forecaster lee/escribe.</p>
      <Table
        head={["Rol", "Base", "Qué"]}
        rows={[
          ["Fuente", "AgroDash (réplica Cartago, Tailscale, RO)", "readings ⋈ sensors ⋈ boxes. Cajas SC = San Carlos. Irradiancia y humedad de suelo salen de acá."],
          ["Store", "Supabase AgroVoltaic (jijklguopafevyucogro)", "lecturas_ambientales_sc (el ETL escribe, data.py lee); predicciones (audit); agente_log"],
        ]}
      />
      <Note>
        <div>El forecaster <b>no toca</b> la tabla fotovoltaica del analizador — convive con ella sin fusionarse. Lee de un caché parquet; solo <IC>cargar_serie(forzar=True)</IC> golpea la DB. <b>NASA POWER no se usa</b> en el código (es solo referencia paralela para los gaps largos).</div>
      </Note>
    </Page>
  );
}

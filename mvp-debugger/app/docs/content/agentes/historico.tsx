import { Page, Note, IC, Table, Meta } from "@/app/docs/ui";
import { CriteriosDelHistorico } from "@/app/docs/content/agentes/criterios";

export function Historico() {
  return (
    <Page
      crumb="Agente Histórico"
      title="Agente Histórico"
      lead="Agente de preguntas y respuestas sobre el histórico fotovoltaico de San Carlos. El LLM solo orquesta; los números salen siempre de herramientas que hacen SQL de solo-lectura sobre las vistas ya limpias."
    >
      <Meta items={[
        ["Framework", "FastAPI"],
        ["Puerto", "8010"],
        ["Modelo", "claude-haiku-4-5"],
        ["max_tokens", "2048"],
        ["Entrypoint", "historico.api:app"],
        ["Fuente", "Supabase PV (RO)"],
      ]} />

      <h2>El lazo del agente</h2>
      <p>Clase <IC>Historico</IC> (<IC>agent/agent.py</IC>): tool-use manual con el SDK de Anthropic (no el tool-runner beta) para control total y no filtrar el razonamiento interno. El agente se construye de forma <strong>perezosa</strong> en el primer <IC>/preguntar</IC> o <IC>/chat</IC>: así <IC>/health</IC> y <IC>/tool</IC> no dependen de la <IC>ANTHROPIC_API_KEY</IC>.</p>
      <p>La <strong>barrera anti-invención</strong> es estructural + de prompt: el modelo no tiene acceso a la DB (toda cifra pasa por el <IC>DISPATCH</IC> de tools) y el system prompt ordena «NUNCA calcules ni inventes números». La comparación PV1 vs PV2 no necesita tool dedicada: <IC>performance_ratio</IC>, <IC>energia_por_arreglo</IC> y <IC>temperatura_por_arreglo</IC> ya devuelven ambos arreglos en una sola llamada.</p>

      <h2>Herramientas</h2>
      <p>Registro en <IC>tools/__init__.py</IC>: cada módulo expone un <IC>SCHEMA</IC> (lo que ve el LLM) y un <IC>run(**params)</IC>. Se dividen en <strong>dos familias</strong>, y la división no es cosmética: llegan a destinos distintos. Las de <b>análisis</b> leen las vistas corregidas y responden <i>qué pasó</i>; las de <b>calidad</b> no calculan nada, leen el store que dejó el barrido y responden <i>si el dato sirve</i>. El mapa vivo de las dos familias, con el contrato de cada herramienta, está en la <a href="/#arq">vista de arquitectura de la consola</a>.</p>
      <p>Las de análisis que agregan sobre un período incrustan el bloque <IC>confianza</IC> en su propia respuesta: dice sobre cuántos días <i>utilizables</i> se calculó el número. Va dentro del payload y no en el prompt, así que el modelo no puede reportar la cifra sin ver su fiabilidad.</p>
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
      <p>Definidos en <IC>api.py</IC>. Los marcados exigen <IC>x-api-key</IC> solo si <IC>HISTORICO_API_KEY</IC> está en el entorno (comparación en tiempo constante).</p>
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

      <CriteriosDelHistorico />

      <h2>Conexión a datos</h2>
      <p>Pool <IC>psycopg_pool.ConnectionPool</IC> (perezoso, <IC>min=1, max=6</IC>) forzado a <strong>solo-lectura</strong> (<IC>SET SESSION ... READ ONLY</IC>). Motivo: abrir conexión al pooler de Supabase cuesta ~700 ms; reusar evita pagarlo por request. El commit <IC>4261062</IC> («pool + cobertura en 1 consulta») bajó una consulta de 8 s a 0,3 s.</p>
      <Note>
        <div><b>Chat con web search.</b> <IC>/chat</IC> añade la server-tool <IC>web_search</IC> (máx. 3 usos) para contexto externo con cita, y usa prompt caching (system + última tool cacheados). El contexto de la vista se inyecta fuera de la parte cacheada para no romper la caché al cambiar de filtro.</div>
      </Note>
    </Page>
  );
}

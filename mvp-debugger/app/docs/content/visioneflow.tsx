"use client";
import { Page, Note, IC, Table, Diagram, Meta } from "../ui";

export function VfPlataforma() {
  return (
    <Page
      crumb="Infra de agentes · VisioneFlow"
      title="VisioneFlow: plataforma y modelo de flujo"
      lead="La plataforma no-code sobre la que corren los agentes en producción. Un agente es un grafo de nodos; el mismo endpoint del sidecar Python se cablea como una herramienta del LLM."
    >
      <h2>Componentes</h2>
      <Table
        head={["Componente", "Rol", "Stack", "Dominio"]}
        rows={[
          [<IC>agent-builder</IC>, "UI + dashboard: editor ReactFlow, CRUD de agentes, auth, API BFF", "Next.js 16, React 19, NextAuth 5", <IC>flow.visione-edge.com</IC>],
          [<IC>Backend</IC>, "Executor / runtime: ejecuta los flujos", "Node 20, Fastify 5.2, Redis, Postgres/Prisma", <IC>api.flow.visione-edge.com</IC>],
          [<IC>flow-mcp</IC>, "Servidor MCP (stdio) para construir/validar/guardar flujos desde un LLM", "TypeScript, MCP SDK", "(local → agent-builder)"],
        ]}
      />
      <p>El agent-builder <strong>guarda</strong> los agentes; el Backend los <strong>ejecuta</strong>. Auth por NextAuth (Google / GitHub / credenciales).</p>

      <h2>Modelo de datos: nodos + edges</h2>
      <p>Un flujo se persiste en formato <strong>ReactFlow</strong> dentro de <IC>agent.flowData = {"{ nodes, edges, flowVariables?, timezone? }"}</IC>.</p>
      <ul>
        <li><strong>Almacenado:</strong> cada nodo es <IC>{"{ id, type, position, data: { label, config: {…} } }"}</IC> — la config del usuario va anidada bajo <IC>data.config</IC>.</li>
        <li><strong>Runtime:</strong> al ejecutar, el Backend <strong>aplana</strong> <IC>data.config</IC> dentro de <IC>data</IC>, así los handlers leen <IC>node.data.provider</IC>, <IC>node.data.url</IC>, etc. (con lectura defensiva de ambas formas).</li>
      </ul>

      <h3>Categorías de edge</h3>
      <Table
        head={["Categoría", "Cómo se identifica", "Efecto"]}
        rows={[
          ["Ejecución", "sin handle especial", "define el orden del DAG (topological sort)"],
          ["Sub-conexión", <><IC>targetHandle ∈ {"{tool, memory}"}</IC></>, "NO se recorre en el DAG; el aiAgent lo consume bajo demanda"],
          ["Knowledge", <><IC>sourceHandle=knowledgeOutput</IC></>, "contexto para el LLM, no flujo"],
          ["Hook", <><IC>sourceHandle=onSuccess</IC></>, "rama que corre fuera de banda tras éxito"],
        ]}
      />
      <p><strong>Conectar un tool a un aiAgent</strong>: edge con <IC>source = nodo tool</IC>, <IC>target = nodo aiAgent</IC>, <IC>targetHandle: "tool"</IC>. Memoria: igual con <IC>targetHandle: "memory"</IC>.</p>

      <h3>Tipos de nodo</h3>
      <Table
        head={["Tipo", "Rol", "Config relevante"]}
        rows={[
          [<IC>aiAgent</IC>, "El cerebro (LLM, ReAct loop)", "provider, model, temperature, maxTokens, systemPrompt, memoryWindowSize, maxIterations"],
          [<IC>httpRequestTool</IC>, "Herramienta HTTP (una mano)", "toolName, description, method, url, timeout, authType + credenciales, toolSchema"],
          [<IC>webhookTrigger · scheduleTrigger · trigger</IC>, "Disparadores (webhook, cron, manual)", "authentication, methods, scheduleTimezone…"],
          [<IC>windowBufferMemory</IC>, "Memoria de ventana deslizante (Redis, TTL 24h)", "windowSize"],
          [<IC>output</IC>, "Salida final (texto, o envío a Telegram)", "finalMessage, outputFormat, telegramChatId…"],
        ]}
      />

      <h2>httpRequestTool: cómo mapea los args</h2>
      <p>El nodo <IC>http-request.tool.ts</IC> convierte los argumentos que decide el LLM en un request HTTP:</p>
      <Diagram>{`  método POST / no-GET  →  body JSON con TODOS los args (excepto url)
  método GET / HEAD     →  query string con cada arg (excepto url)
  URL con {param}       →  interpolación desde args[param] (URL-encoded)
  auth                  →  bearer | basic | apiKey (header)
  guard SSRF            →  valida la URL antes del fetch (bloquea IPs privadas)`}</Diagram>
      <Note kind="warn">
        <div><b>Guard SSRF.</b> El runtime valida la URL antes de llamar y bloquea <IC>localhost</IC> e IPs privadas. Por eso los sidecars se exponen por HTTPS público (<IC>api.flow.visione-edge.com/forecast/…</IC>) con <IC>x-api-key</IC>, no por <IC>127.0.0.1</IC>.</div>
      </Note>

      <h2>Ejecución de un flujo</h2>
      <p>El Backend expone tres rutas Fastify (el modo se elige por ruta, no por un flag):</p>
      <Table
        head={["Endpoint", "Modo"]}
        rows={[
          [<IC>POST /api/agents/:id/execute</IC>, "async / encolado → { jobId, status: 'queued' } (202)"],
          [<IC>POST /api/agents/:id/execute/sync</IC>, "síncrono → { output, executionResult }"],
          [<IC>POST /api/agents/:id/execute/stream</IC>, "SSE (node:start/complete, llm:token, flow:complete)"],
        ]}
      />
      <p>El body lleva <IC>input</IC> (requerido) y opcionales <IC>sessionId</IC>, <IC>variables</IC>, <IC>credentials</IC>, <IC>triggerNodeId</IC>. Si no se pasa el trigger, el runtime busca un nodo <IC>trigger</IC>; con varios triggers (webhook + schedule) hay que indicar cuál. El agente debe estar <IC>isActive</IC>.</p>
    </Page>
  );
}

export function VfAgentes() {
  return (
    <Page
      crumb="Infra de agentes · VisioneFlow"
      title="Los agentes en producción y flow-mcp"
      lead="Los dos agentes no-code de AgroVoltaic espejan a los dos sidecars Python: cada endpoint HTTP se cablea como un httpRequestTool colgando de un aiAgent."
    >
      <h2>Los dos agentes</h2>
      <p>Cada agente es un <IC>aiAgent</IC> (el LLM que orquesta) con nodos <IC>httpRequestTool</IC> que apuntan a los endpoints del sidecar correspondiente vía <IC>https://api.flow.visione-edge.com</IC> con <IC>x-api-key</IC>, más <IC>windowBufferMemory</IC> y triggers (webhook + schedule).</p>
      <Table
        head={["Agente", "Sidecar", "Herramientas (httpRequestTool → endpoint)"]}
        rows={[
          [<><b>Agrovoltaic-Analyzer</b><br/><span className="muted">cmsnlratt…</span></>, "analizador :8010", <>Las tools de datos del analizador → <IC>/analizador/tool/{"<nombre>"}</IC> (energia, PR, irradiancia, temperatura, cobertura, catálogo) + <IC>tendencia</IC></>],
          [<><b>Agrovoltaic-Agent</b><br/><span className="muted">cmryfgwop…</span></>, "pronóstico :8000", <>Pronóstico y anomalías → <IC>/forecast/…</IC> + <IC>backtest</IC></>],
        ]}
      />
      <Note>
        <div><b>Misma verdad, dos superficies.</b> Estos agentes y el mvp-debugger consumen exactamente los mismos endpoints de los sidecars. La diferencia es solo el «cerebro»: en la web es el agente Python; en VisioneFlow es el nodo <IC>aiAgent</IC>. La lógica de negocio (las tools) vive una sola vez, en Python.</div>
      </Note>

      <h2>flow-mcp: construir y editar flujos por código</h2>
      <p>Un servidor MCP (<IC>flow-mcp/src/server.ts</IC>) que deja a un LLM construir, validar y guardar flujos sin leer el código de la plataforma. Tools registradas: <IC>list_node_types</IC>, <IC>get_node_schema</IC>, <IC>validate_flow</IC>, <IC>create_flow</IC>, <IC>add_node</IC>, <IC>connect_nodes</IC>, <IC>explain_connection_rules</IC>, <IC>get_flow_examples</IC> y <IC>save_flow</IC> (upsert por nombre, destructivo).</p>

      <h3>Helpers de merge no destructivo (save.ts)</h3>
      <p>Además de las tools MCP, <IC>save.ts</IC> exporta dos helpers programáticos que se usaron para <strong>extender los agentes existentes sin recrearlos</strong>:</p>
      <Table
        head={["Función", "Qué hace"]}
        rows={[
          [<IC>getAgent(nombreOId)</IC>, "Lee un agente y devuelve un resumen estructural seguro (nodos, edges, config) con los secretos redactados («redacted»)."],
          [<IC>addHttpToolsToAgent(...)</IC>, "Merge NO destructivo: cuelga uno o más httpRequestTool del único aiAgent, agrega el edge targetHandle:'tool', preserva flowVariables/timezone, e idempotente por toolName (actualiza en sitio si ya existe). Deploy opcional."],
        ]}
      />
      <Note kind="good">
        <div><b>Por qué merge y no recrear.</b> Así se agregaron <IC>backtest</IC> (al Agent) y <IC>tendencia</IC> (al Analyzer) sin tocar el resto del flujo. Los secretos entran por <IC>flow-mcp/.env</IC> con placeholders <IC>PEGAR_&lt;KEY&gt;</IC> que se resuelven desde el entorno — nunca por el contexto del asistente. La autenticación es NextAuth por credenciales; las keys se redactan siempre.</div>
      </Note>
    </Page>
  );
}

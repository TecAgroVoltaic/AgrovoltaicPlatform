"use client";
import { Page, Note, Diagram, IC, Table } from "../ui";

export function Arquitectura() {
  return (
    <Page
      crumb="Arquitectura"
      title="Topología del sistema"
      lead="Qué corre dónde, quién habla con quién y cómo viaja una pregunta desde la interfaz hasta un número verificable."
    >
      <h2>El patrón: cerebro vs. manos</h2>
      <p>Todo el sistema se apoya en una separación deliberada. El <strong>LLM (cerebro)</strong> entiende la pregunta, decide qué herramientas llamar y redacta la respuesta — pero <strong>nunca calcula ni inventa un número</strong>. Las <strong>herramientas (manos)</strong> son funciones Python que hacen SQL de solo-lectura o física sobre datos medidos, y son la única fuente de cifras.</p>
      <p>Esa separación se repite en dos superficies: el <strong>mvp-debugger</strong> (donde el cerebro es el propio agente Python) y <strong>VisioneFlow</strong> (donde el cerebro es un nodo <IC>aiAgent</IC> y las manos son nodos <IC>httpRequestTool</IC> que llaman a los mismos endpoints).</p>

      <h2>Componentes</h2>
      <Table
        head={["Componente", "Qué es", "Puerto / dominio"]}
        rows={[
          [<IC>mvp-debugger</IC>, "Web Next.js 14: consola de evaluación + chat. Proxy server-side hacia los agentes.", "3000 (local) · AWS Amplify (prod)"],
          [<IC>agente-analizador</IC>, "FastAPI. Q&A del histórico fotovoltaico. 8 tools SQL sobre la Supabase PV.", "8010"],
          [<IC>agente-pronostico</IC>, "FastAPI. Pronóstico de irradiancia y humedad de suelo + backtest + anomalías.", "8000"],
          [<IC>Supabase PV</IC>, "PostgreSQL: tablas crudas del inversor/piranómetro + vistas de corrección. Proyecto jijklguopafevyucogro.", "Session pooler (RO)"],
          [<IC>AgroDash</IC>, "PostgreSQL región Cartago (réplica): sensores de suelo/ambiente de ambos sitios. Fuente del pronóstico.", "Tailscale (RO)"],
          [<IC>VisioneFlow</IC>, "Plataforma de agentes: agent-builder (edición) + Backend (ejecución).", "flow · api.flow.visione-edge.com"],
        ]}
      />

      <h2>Flujo de una pregunta (mvp-debugger)</h2>
      <p>Cuando preguntás algo en el chat de la consola:</p>
      <Diagram>{`  1. Browser        el widget manda { mensajes[], contexto } a
                    POST /api/analizador/chat   (nunca al Python directo)

  2. Route handler  app/api/analizador/[...path]/route.ts reenvía al
     (Next server)   servicio Python e INYECTA el header x-api-key
                    (la key vive solo en el servidor, nunca en el browser)

  3. Agente Python  el lazo LLM (Anthropic Haiku 4.5) decide tools,
                    las ejecuta (SQL RO sobre las vistas v_sc_*),
                    redacta y arma la TRAZA (pasos + usage + costo)

  4. Vuelta         la traza sube tal cual; el widget pinta la respuesta,
                    el gráfico inline (si una tool devolvió _grafico) y
                    la traza plegable paso a paso`}</Diagram>

      <Note>
        <div><b>Por qué el proxy.</b> El browser jamás habla directo con Python ni ve las API keys: todo pasa por rutas <IC>/api/*</IC> del lado servidor que reenvían con la clave. Las keys viven solo en <IC>app/lib/config.ts</IC> (server-only). Ver <a href="#web">La web · arquitectura</a>.</div>
      </Note>

      <h2>Las dos bases de datos (no se fusionan)</h2>
      <p>San Carlos está <strong>partido en dos</strong> a nivel de almacenamiento:</p>
      <ul>
        <li><strong>PV eléctrico</strong> (inversor, piranómetro, temperatura de panel) → <strong>Supabase PV</strong>. Lo lee el <a href="#analizador">analizador</a>.</li>
        <li><strong>Ambiental / suelo</strong> (irradiancia de referencia, humedad de suelo) → <strong>AgroDash</strong> (cajas con sufijo <IC>SC</IC>). Lo lee el <a href="#pronostico">pronóstico</a>, que copia lo que necesita a un <em>store</em> propio en la Supabase de AgroVoltaic.</li>
      </ul>
      <p>No hay una DB central: son dos mundos separados. Lo único comparable entre San Carlos y Cartago son variables ambientales — el PV eléctrico no tiene contraparte en Cartago.</p>

      <h2>Producción vs. local</h2>
      <Table
        head={["", "Local (dev.sh)", "Producción (EC2)"]}
        rows={[
          ["analizador", "127.0.0.1:8010", "sidecar Docker, nginx /analizador/ → :8010"],
          ["pronóstico", "127.0.0.1:8000", "sidecar Docker, nginx /forecast/ → :8000"],
          ["web", "localhost:3000 (next dev)", "AWS Amplify (apunta a api.flow.visione-edge.com)"],
          ["auth agentes", "sin key (abierto)", "x-api-key obligatorio (HTTPS)"],
        ]}
      />
      <p>Detalle completo en <a href="#infra">Despliegue</a>.</p>
    </Page>
  );
}

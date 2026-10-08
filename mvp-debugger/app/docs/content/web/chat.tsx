import { Page, Note, IC, Table } from "@/app/docs/ui";

export function WebChat() {
  return (
    <Page
      crumb="La web · mvp-debugger"
      title="Chat, traza y componentes"
      lead="El asistente flotante, la traza (la pieza central del debugger) y los componentes del debugger crudo."
    >
      <h2>El chat flotante</h2>
      <p><IC>components/chat/ChatWidget.tsx</IC>: un bubble abajo-derecha que se expande a un panel. <strong>Hilos separados por agente</strong> (no se mezclan), persistidos en <IC>localStorage</IC>. Manda el historial de texto limpio + el contexto de la vista actual a <IC>/api/{"<agente>"}/chat</IC>, y renderiza:</p>
      <ul>
        <li>La respuesta (con markdown mínimo: negritas).</li>
        <li><strong>Gráficos inline</strong> de datos reales: cuando una tool devolvió el marcador <IC>_grafico</IC>, se pinta como SVG (sin librerías, <IC>app/lib/charts.ts</IC>).</li>
        <li>Un indicador con frases genéricas mientras espera, y una <strong>traza plegable</strong> por respuesta (tools usadas, búsquedas web, costo).</li>
      </ul>

      <h2>La traza</h2>
      <p>Es la pieza clave del debugger (<IC>components/TraceViewer.tsx</IC>). Muestra, en orden, cada turno del modelo y cada ejecución de tool con su input y su <strong>salida cruda</strong>, más la respuesta final y el consumo.</p>
      <Table
        head={["Campo de la traza", "Contenido"]}
        rows={[
          [<IC>pasos[]</IC>, <>Cada paso es <IC>modelo</IC> (texto + tools que pide + stop_reason), <IC>tool</IC> (nombre, input, salida cruda, error, ms) o <IC>web</IC> (query)</>],
          [<IC>respuesta</IC>, "El texto final que redactó el agente"],
          [<IC>usage</IC>, "input_tokens, output_tokens, requests (+ cache_read/write y web_searches en /chat)"],
          [<IC>costo</IC>, "modelo, usd_input, usd_output, usd_total, tarifa"],
          [<IC>ms_total</IC>, "Latencia total del turno"],
        ]}
      />

      <h2>Componentes del debugger crudo</h2>
      <p>Las rutas legacy <IC>/analizador</IC> y <IC>/pronostico</IC> exponen herramientas de depuración más directas:</p>
      <Table
        head={["Componente", "Qué hace"]}
        rows={[
          [<IC>Ask</IC>, "Caja de pregunta → POST /preguntar → traza completa (turno LLM, tools, respuesta, costo)"],
          [<IC>ToolRunner</IC>, "Ejecuta una tool atómica directo (sin LLM) con los params que quieras: POST /tool/{nombre}"],
          [<IC>DataExplorer</IC>, "Cobertura, filas crudas y series graficadas de cada relación de la Supabase PV"],
          [<IC>Kpis</IC>, "Llama las tools con período abierto: estado actual del sistema"],
          [<IC>PronosticoPanel</IC>, "Series del store (irradiancia + humedad) con resumen/sparkline + detección de anomalías"],
          [<IC>Uso · Health</IC>, "Consumo acumulado del agente y estado del servicio"],
        ]}
      />
      <Note>
        <div>El <IC>ToolRunner</IC> es el mejor amigo del escéptico: corre una tool sin el LLM en el medio y ves el número puro, para contrastarlo con lo que el agente dijo en la traza.</div>
      </Note>
    </Page>
  );
}

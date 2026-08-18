"use client";
import { Page, Note, IC, Table, Diagram, Meta } from "../ui";

export function WebArquitectura() {
  return (
    <Page
      crumb="La web · mvp-debugger"
      title="La web: arquitectura y superficies"
      lead="Qué es esta web, sus dos superficies, y cómo habla con los agentes sin exponer nunca una API key al browser."
    >
      <p>El <strong>mvp-debugger</strong> es una web Next.js 14 para <strong>probar y depurar en vivo</strong> los dos agentes con datos reales. Su objetivo no es diseño: es ver <strong>qué consulta el agente, qué calcula y cómo redacta</strong>, y poder cruzar cada número contra los datos de las bases.</p>
      <Meta items={[
        ["Framework", "Next.js 14.2.35"],
        ["React", "18.3.1"],
        ["Puerto", "3000"],
        ["Dependencias runtime", "solo next + react"],
      ]} />

      <h2>Regla de oro del debugger</h2>
      <Note kind="good">
        <div><b>Todo número de la respuesta final tiene que aparecer en la salida de alguna tool.</b> Si un número no está en la traza, es una alerta: el modelo estaría alucinando. La web existe para hacer verificable esa regla.</div>
      </Note>

      <h2>Dos superficies</h2>
      <Table
        head={["Ruta", "Superficie", "Para qué"]}
        rows={[
          [<IC>/</IC>, <><b>Consola de evaluación</b></>, "La pulida: 4 vistas (Reconciliación, Predicción vs Real, Rendimiento, Costo) + chat flotante. Ver «Vistas de la consola»."],
          [<><IC>/analizador</IC> · <IC>/pronostico</IC></>, <><b>Debugger crudo</b> (legacy)</>, "Health, caja de preguntas con traza completa, runner manual de tools, explorador de datos. Ver «Chat, traza y componentes»."],
        ]}
      />

      <h2>El proxy /api/* (por qué el browser nunca ve las keys)</h2>
      <Diagram>{`  Browser ─► /api/analizador/*  (route handler, inyecta x-api-key) ─► :8010 ─► Supabase PV (RO)
          └► /api/pronostico/*  (route handler, inyecta x-api-key) ─► :8000 ─► AgroDash / store (RO)`}</Diagram>
      <p>El browser <strong>nunca</strong> habla directo con los servicios Python ni ve las keys. Todo pasa por rutas catch-all del lado servidor:</p>
      <ul>
        <li><IC>app/api/analizador/[...path]/route.ts</IC> y <IC>app/api/pronostico/[...path]/route.ts</IC> reenvían método + query + body al upstream.</li>
        <li><IC>app/lib/upstream.ts</IC> hace el <IC>fetch</IC> e inyecta el header <IC>x-api-key</IC> solo si la key existe. Si el Python está caído, devuelve un 502 legible.</li>
        <li><IC>app/lib/config.ts</IC> es <strong>server-only</strong>: aquí viven las URLs y keys, nunca se serializan al cliente.</li>
      </ul>
      <p>El cliente usa <IC>app/lib/client.ts</IC> (<IC>jget</IC>/<IC>jpost</IC>), que siempre pega a <IC>/api/*</IC> y devuelve <IC>{"{status, ok, data}"}</IC> para mostrar errores sin que la UI explote.</p>
      <Note>
        <div><b>Una sola fuente de verdad.</b> Los endpoints que consume el debugger (<IC>/datos/*</IC>, <IC>/backtest</IC>, <IC>/serie</IC>…) se agregaron a los propios agentes, no se reimplementan en Node. Todo es solo-lectura sobre las bases.</div>
      </Note>

      <h2>Configuración</h2>
      <Table
        head={["Variable (server)", "Default", "Para qué"]}
        rows={[
          [<IC>ANALIZADOR_URL</IC>, <IC>http://127.0.0.1:8010</IC>, "servicio del analizador"],
          [<IC>PRONOSTICO_URL</IC>, <IC>http://127.0.0.1:8000</IC>, "servicio del pronóstico"],
          [<IC>ANALIZADOR_API_KEY</IC>, "(vacío en local)", "se inyecta como x-api-key al analizador"],
          [<IC>PRONOSTICO_API_KEY</IC>, "(vacío en local)", "se inyecta como x-api-key al pronóstico"],
        ]}
      />
      <p>En local se corre todo con <IC>./dev.sh</IC> (levanta analizador:8010 + pronóstico:8000 + next:3000). Detalle en <a href="#infra">Despliegue</a>.</p>
    </Page>
  );
}

export function WebConsola() {
  return (
    <Page
      crumb="La web · mvp-debugger"
      title="Vistas de la consola"
      lead="Qué muestra cada una de las cuatro secciones de la consola (ruta /), y de qué endpoint sale cada dato."
    >
      <p>La consola (<IC>components/console/Console.tsx</IC>) es un shell con barra lateral: selector de agente (Analizador / Pronóstico), navegación de 4 vistas, indicador de salud de la DB (ping a <IC>/health</IC> cada 15 s) y toggle de tema. Abajo a la derecha, el chat flotante.</p>

      <h2>1 · Reconciliación</h2>
      <p>La vista por defecto del analizador. Muestra los <strong>datos crudos en vivo</strong> (tabla <IC>electrico_corregido</IC>: timestamp, potencias PV1/PV2/AC, temperaturas) buscables y con «cargar más», más tres tarjetas de <strong>cobertura</strong> (eléctrica, radiación 15 s, performance). La idea: preguntale al chat y cruzá cada número de su respuesta contra estos datos. Sale de <IC>/api/analizador/datos/muestra</IC> y <IC>/datos/tablas</IC>.</p>

      <h2>2 · Predicción vs Real</h2>
      <p>La vista del pronóstico. Pinta un <strong>backtest</strong> (<IC>/api/pronostico/backtest?variable=&dias=&bucket=h</IC>) con tres series: Real (medido), Reconstrucción del método y Cielo despejado (techo). Controles: variable (irradiancia / humedad de suelo) y ventana (3/7/14 días). Debajo, KPIs de error (MAE, sesgo, error relativo, skill) y el desglose de mayores desvíos.</p>
      <Note kind="warn">
        <div>El banner lo deja explícito: <b>es un backtest, no predicciones en vivo</b>. El agente no pronostica de forma continua — predice solo cuando se le llama.</div>
      </Note>

      <h2>3 · Rendimiento</h2>
      <p>KPIs reales del sistema (energía por arreglo, PR, GHI media/kt*) llamando las tools <IC>energia_por_arreglo</IC>, <IC>performance_ratio</IC>, <IC>irradiancia_resumen</IC>, <IC>temperatura_por_arreglo</IC>. Series graficadas por período (todo / 2026 / mayo) y variable (potencia, irradiancia, kt*, PR), con comparación PV1 vs PV2. Incluye un scatter <strong>irradiancia → potencia PV1</strong>. Las series salen de <IC>/api/analizador/datos/serie</IC>.</p>
      <Note>
        <div>Honestidad sobre la cadencia variable: el gráfico de «potencia» es <b>potencia media por bucket</b> (robusta al muestreo que cambia de 2 s a 5 min); la energía real en kWh vive en el KPI.</div>
      </Note>

      <h2>4 · Costo y uso</h2>
      <p>Cuánto cuesta operar el agente. El <strong>acumulado real</strong> (<IC>GET /uso</IC>, persistido: tokens, USD, nº consultas) y el <strong>gasto de la sesión</strong> — cada pregunta que hacés suma su costo, con gráfico acumulado, split entrada/salida y proyección. Tarifa del modelo <IC>claude-haiku-4-5</IC> ($1 in / $5 out por millón de tokens).</p>
    </Page>
  );
}

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
        <li><strong>Gráficos inline</strong> de datos reales — cuando una tool devolvió el marcador <IC>_grafico</IC>, se pinta como SVG (sin librerías, <IC>app/lib/charts.ts</IC>).</li>
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
          [<IC>ToolRunner</IC>, "Ejecuta una tool atómica directo (sin LLM) con los params que quieras — POST /tool/{nombre}"],
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

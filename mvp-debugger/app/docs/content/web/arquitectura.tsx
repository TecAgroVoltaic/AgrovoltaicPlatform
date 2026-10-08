import { Page, Note, IC, Table, Meta, Diagram } from "@/app/docs/ui";

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
          [<IC>/</IC>, <><b>Consola de evaluación</b></>, "La pulida: 6 vistas (Reconciliación, Predicción vs Real, Rendimiento, Descargas, Costo, Salud) + chat flotante. Ver «Vistas de la consola»."],
          [<><IC>/analizador</IC> · <IC>/pronostico</IC></>, <><b>Debugger crudo</b> (legacy)</>, "Health, caja de preguntas con traza completa, runner manual de tools, explorador de datos. Ver «Chat, traza y componentes»."],
        ]}
      />

      <h2>El proxy /api/* (por qué el browser nunca ve las keys)</h2>
      <Diagram>{`  Browser ─► /api/historico/*  (route handler, inyecta x-api-key) ─► :8010 ─► Supabase PV (RO)
          └► /api/predictivo/*  (route handler, inyecta x-api-key) ─► :8000 ─► AgroDash / store (RO)`}</Diagram>
      <p>El browser <strong>nunca</strong> habla directo con los servicios Python ni ve las keys. Todo pasa por rutas catch-all del lado servidor:</p>
      <ul>
        <li><IC>app/api/historico/[...path]/route.ts</IC> y <IC>app/api/predictivo/[...path]/route.ts</IC> reenvían método + query + body al upstream.</li>
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
          [<IC>HISTORICO_URL</IC>, <IC>http://127.0.0.1:8010</IC>, "servicio del analizador"],
          [<IC>PREDICTIVO_URL</IC>, <IC>http://127.0.0.1:8000</IC>, "servicio del pronóstico"],
          [<IC>HISTORICO_API_KEY</IC>, "(vacío en local)", "se inyecta como x-api-key al analizador"],
          [<IC>PREDICTIVO_API_KEY</IC>, "(vacío en local)", "se inyecta como x-api-key al pronóstico"],
        ]}
      />
      <p>En local se corre todo con <IC>./dev.sh</IC> (levanta analizador:8010 + pronóstico:8000 + next:3000). Detalle en <a href="#infra">Despliegue</a>.</p>
    </Page>
  );
}

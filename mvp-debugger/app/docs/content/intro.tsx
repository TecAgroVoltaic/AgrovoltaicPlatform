"use client";
import { Page, Cards, Note, Diagram, IC, Table, Meta } from "../ui";
import { ConceptChat } from "../ConceptChat";

export function Overview() {
  return (
    <Page
      crumb="Introducción"
      title="Documentación del sistema AgroVoltaic"
      lead={<>Referencia técnica de todo el ecosistema de agentes de San Carlos: la web que estás viendo, los dos agentes de IA que la alimentan, la base de datos fotovoltaica, la infraestructura de agentes en VisioneFlow y el despliegue. Todo lo que sigue está verificado contra el código real del repositorio.</>}
    >
      <p>El proyecto AgroVoltaic estandariza y explota los datos de un sistema agrovoltaico (paneles solares + agricultura) en San Carlos, Costa Rica. Sobre esos datos ya limpios viven <strong>dos agentes de IA</strong> — uno que analiza el histórico fotovoltaico y otro que pronostica variables ambientales — y una <strong>web de evaluación</strong> (este mvp-debugger) para verlos trabajar con datos reales, número por número.</p>

      <Note>
        <div><b>Cómo leer estos docs.</b> Cada página describe una pieza real y enlaza a su archivo. La regla de oro del proyecto atraviesa todo: <strong>los agentes nunca inventan números</strong> — cada cifra sale de una herramienta que hace SQL o física sobre datos medidos, y la traza lo demuestra.</div>
      </Note>

      <h2>Mapa del sistema</h2>
      <p>Tres capas: los <strong>datos</strong> (dos bases distintas), los <strong>agentes</strong> Python que los consultan (el «cerebro vs. manos»: el LLM orquesta, las herramientas traen los números), y las dos <strong>superficies</strong> que hablan con esos agentes — el mvp-debugger y los agentes no-code de VisioneFlow.</p>

      <Diagram>{`                            pregunta en lenguaje natural
                                        │
        ┌───────────────────────────────▼──────────────────────────────┐
        │                    SUPERFICIES (dos)                          │
        │                                                               │
        │   mvp-debugger (Next.js)          VisioneFlow  (no-code)      │
        │   consola + chat flotante         aiAgent + httpRequestTool   │
        │   proxy server /api/*             flow.visione-edge.com       │
        └───────────────┬───────────────────────────┬───────────────────┘
                        │  x-api-key                 │  x-api-key
          ┌─────────────▼─────────────┐   ┌──────────▼─────────────┐
          │  agente-analizador  :8010 │   │  agente-pronostico :8000│
          │  Q&A del histórico PV     │   │  forecast + backtest    │
          │  Anthropic Haiku 4.5      │   │  Anthropic Haiku 4.5    │
          └─────────────┬─────────────┘   └──────────┬─────────────┘
                 SQL RO  │                     RO     │
          ┌─────────────▼─────────────┐   ┌──────────▼─────────────┐
          │  Supabase PV (San Carlos) │   │  AgroDash (Cartago,     │
          │  monitoreo_sc_electrico   │   │  réplica) ── ETL ──►    │
          │  radiacion_sc_15s         │   │  store lecturas_amb_sc  │
          │  + vistas v_sc_* corregid │   │  (Supabase AgroVoltaic) │
          └───────────────────────────┘   └────────────────────────┘`}</Diagram>

      <Meta items={[
        ["Sitio", "San Carlos · 10.33°N, 84.42°O"],
        ["Zona horaria", "UTC−6 (sin DST)"],
        ["LLM", "claude-haiku-4-5"],
        ["Agentes", "2 (analizador + pronóstico)"],
        ["Web", "Next.js 14 · mvp-debugger"],
      ]} />

      <h2>Por dónde seguir</h2>
      <Cards items={[
        { id: "arquitectura", title: "Topología del sistema", desc: "Cómo viaja una pregunta de la web a la respuesta, y qué habla con qué." },
        { id: "datos-esquema", title: "La base de datos PV", desc: "Tablas crudas + vistas de corrección. El modelo «crudo en la DB, corrección en capa de análisis»." },
        { id: "analizador", title: "Agente Analizador PV", desc: "8 herramientas SQL sobre el histórico, endpoints y el lazo LLM." },
        { id: "pronostico", title: "Agente Pronóstico", desc: "Persistencia de kt* × cielo despejado, backtest histórico y anomalías." },
        { id: "web-consola", title: "Vistas de la consola", desc: "Reconciliación, Predicción vs Real, Rendimiento y Costo — qué muestra cada una." },
        { id: "visioneflow", title: "Infra de agentes (VisioneFlow)", desc: "El modelo de flujo, los nodos y cómo se cablean los mismos endpoints como tools." },
      ]} />

      <h2>Convenciones</h2>
      <ul>
        <li><IC>archivo:línea</IC> apunta al código fuente exacto de cada afirmación.</li>
        <li><strong>PV1 = arreglo Inclinado</strong> (tilt 20°, azimut 150°) · <strong>PV2 = arreglo Vertical</strong> (tilt 90°, azimut 50°). Ambos bifaciales, 1420 Wp cada uno.</li>
        <li><strong>Crudo vs. corregido:</strong> las tablas guardan el valor del sensor tal cual; las vistas <IC>v_sc_*</IC> aplican las correcciones. Nunca se destruye el dato original.</li>
      </ul>
    </Page>
  );
}

export function Glosario() {
  return (
    <Page crumb="Introducción" title="Glosario" lead="Términos que aparecen en toda la documentación, el código y la interfaz. ¿Alguno no te cierra? Preguntale a un agente acá mismo.">
      <h2>Preguntale a un agente</h2>
      <ConceptChat />

      <h2>Términos</h2>
      <Table
        head={["Término", "Qué es"]}
        rows={[
          [<IC>PV1 / PV2</IC>, "Los dos strings del inversor = los dos arreglos. PV1 = Inclinado (20°/150°); PV2 = Vertical (90°/50°). Ambos bifaciales, 4×355 Wp = 1420 Wp."],
          [<IC>GHI</IC>, "Global Horizontal Irradiance — irradiancia solar sobre plano horizontal, en W/m². Lo que mide el piranómetro / celda calibrada."],
          [<IC>POA</IC>, "Plane Of Array — irradiancia sobre el plano inclinado del panel (transpuesta desde GHI con pvlib). Base para el Performance Ratio."],
          [<IC>kt* (kt estrella)</IC>, <>Índice de claridad de cielo despejado: <IC>GHI_medida / GHI_cielo-despejado</IC>. Aísla el efecto de las nubes de la geometría solar. Es lo que el pronóstico «persiste».</>],
          [<IC>Cielo despejado (clear-sky)</IC>, "GHI teórica sin nubes, modelada con pvlib (Ineichen + turbidez Linke). Es el «techo» físico de irradiancia en cada instante."],
          [<IC>PR (Performance Ratio)</IC>, "Eficiencia real del arreglo: energía DC producida ÷ energía que debería producir según la irradiancia POA y la potencia nominal (1420 Wp). Adimensional, típico 0.6–0.8."],
          [<IC>Bifacial</IC>, "Panel que capta luz por ambas caras. Explica que el arreglo vertical (PV2) genere pese a mirar «de canto»: capta directa por delante y reflejada por detrás."],
          [<IC>kWp / Wp</IC>, "Watt-pico: potencia nominal del panel en condiciones estándar. El sistema tiene 2840 Wp (2 × 1420)."],
          [<IC>Backtest</IC>, "Reconstrucción honesta: «cómo habría predicho» una fecha pasada, contra lo que el sensor realmente midió. Evalúa el método; NO es una predicción en vivo."],
          [<IC>Persistencia</IC>, "Modelo de pronóstico que asume que el estado reciente se mantiene. «Inteligente» (smart) aquí = persistir kt*, no el valor crudo, para no arrastrar la geometría solar."],
          [<IC>Traza</IC>, "El registro paso a paso de una consulta al agente: cada turno del LLM, cada tool con su input y salida cruda, tokens y costo. Es la pieza central del debugger."],
          [<IC>Celda calibrada</IC>, "Nombre comercial del sensor de irradiancia analógico original — NO viene ya escalado a W/m². Por eso hay que calibrar por clear-sky."],
          [<IC>DS18B20</IC>, "Sensor de temperatura de los paneles. Su valor de error por defecto es 85.0 °C (sensor desconectado)."],
          [<IC>AgroDash</IC>, "Base de datos de la región Cartago (PostgreSQL, app Rust/Axum): sensores de suelo/ambiente. La data ambiental de San Carlos vive ahí; el pronóstico la lee."],
          [<IC>Supabase PV</IC>, "La base fotovoltaica de San Carlos (proyecto jijklguopafevyucogro): tablas crudas del inversor/piranómetro + vistas de corrección. La lee el analizador."],
          [<IC>VisioneFlow</IC>, "Plataforma no-code para construir agentes como flujos de nodos. El agent-builder los edita; el Backend los ejecuta."],
          [<IC>aiAgent / httpRequestTool</IC>, "En VisioneFlow: el nodo-cerebro (LLM) y el nodo-herramienta que llama a un endpoint HTTP. Cada tool del sidecar se cablea como un httpRequestTool."],
        ]}
      />
    </Page>
  );
}

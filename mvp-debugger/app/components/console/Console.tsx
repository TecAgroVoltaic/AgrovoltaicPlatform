"use client";
// Shell de la consola: barra lateral (agente + navegación + salud DB + tema) y el
// lienzo con la vista activa. Junta las vistas y colecciona el gasto de sesión.
//
// La barra ARRANCA COMPACTA (solo iconos) en cada carga, y expandirla es un gesto
// explícito que no se recuerda: lo que importa en esta consola son los datos, y
// una columna de 230 px de texto que nunca cambia les roba ancho a las gráficas.
// Compacta, el icono ES la etiqueta; el nombre completo aparece al pasar el mouse
// (`data-tip`, atendido por ChartTooltip, que ya está montado acá).
//
// Eso vale EN ESCRITORIO. En una pantalla angosta la barra se vuelve cajón y ahí
// va siempre ancha: adentro de un cajón de 284 px no hay ancho que ahorrar, y el
// mouse que mostraba los nombres no existe. Ver `useBarraEnCajon` para por qué la
// condición se evalúa en JS y no solo con una media query.
import { Fragment, useEffect, useState, type ComponentType } from "react";
import { jget } from "@/app/lib/client";
import { ChartTooltip } from "@/app/components/ChartTooltip";
import { ConsoleDrawer } from "@/app/components/console/ConsoleDrawer";
import { useBarraEnCajon } from "@/app/components/console/useBarraEnCajon";
import {
  IconoCalidad, IconoCosto, IconoDatos, IconoDocs, IconoGrafo, IconoPanel,
  IconoPrediccion, IconoReconciliar, IconoRendimiento, IconoSalud, IconoTablero,
} from "@/app/components/Iconos";
import { CalidadView } from "@/app/components/console/CalidadView";
import { ReconView } from "@/app/components/console/ReconView";
import { PredView } from "@/app/components/console/PredView";
import { ArqView } from "@/app/components/console/arquitectura/ArqView";
import { DatosView } from "@/app/components/console/datos/DatosView";
import { PerfView } from "@/app/components/console/PerfView";
import { CostoView } from "@/app/components/console/CostoView";
import { SaludView } from "@/app/components/console/SaludView";
import { ChatWidget } from "@/app/components/chat/ChatWidget";
import type { Traza } from "@/app/components/TraceViewer";

type View = "recon" | "pred" | "arq" | "calidad" | "datos" | "perf" | "costo" | "salud";
type Icono = ComponentType<{ size?: number }>;

// DOS AGENTES. No hay más, y estos son sus nombres.
type Agente = { id: string; nombre: string; inicial: string; sub: string };
const AGENTES: Agente[] = [
  { id: "historico",  nombre: "Agente Histórico",  inicial: "H",
    sub: "qué pasó y si el dato sirve" },
  { id: "predictivo", nombre: "Agente Predictivo", inicial: "P",
    sub: "humedad e irradiancia" },
];

// La navegación tiene DOS mitades y se arma sola.
//
// Arriba, las vistas DEL AGENTE: cambian al cambiar de agente porque hablan de
// ese agente. «Arquitectura» aparece en las dos y NO es la misma vista con otros
// datos: cada agente tiene su propia pantalla porque no están organizados igual
// (el Predictivo por modos, el Histórico por familias). `ArqView` despacha.
//
// Abajo, las FIJAS: se ven siempre, con cualquier agente, porque no son de
// ninguno. La base de datos es una sola, el costo se mira junto y la salud del
// sistema es del sistema.
const VISTAS_AGENTE: Record<string, [View, string, Icono][]> = {
  historico: [
    ["calidad", "Calidad de datos", IconoCalidad],
    ["recon", "Reconciliación", IconoReconciliar],
    ["perf", "Rendimiento", IconoRendimiento],
    ["arq", "Arquitectura del agente", IconoGrafo],
  ],
  predictivo: [
    ["pred", "Predicción vs Real", IconoPrediccion],
    ["arq", "Arquitectura del agente", IconoGrafo],
  ],
};
const VISTAS_FIJAS: [View, string, Icono][] = [
  ["datos", "Base de datos", IconoDatos],
  ["costo", "Costo y uso", IconoCosto],
  ["salud", "Salud del sistema", IconoSalud],
];

const LABEL = Object.fromEntries(
  [...Object.values(VISTAS_AGENTE).flat(), ...VISTAS_FIJAS].map(([v, l]) => [v, l]),
) as Record<View, string>;

/** ¿A qué agente pertenece la vista? undefined = es fija (de ninguno). */
function agenteDe(v: View): string | undefined {
  return Object.keys(VISTAS_AGENTE).find((a) => VISTAS_AGENTE[a].some(([x]) => x === v));
}

/**
 * `historico` = ¿está habilitado el Q&A del Agente Histórico? Viene del servidor
 * (lib/agentes) via app/page.tsx. Con él apagado se cae su hilo de chat y el proxy
 * responde 503 a /preguntar y /chat. Lo que NO se cae son sus vistas de calidad ni
 * su arquitectura: son deterministas, no gastan un centavo, y son justamente lo
 * que se está construyendo.
 */
export function Console({ historico = true }: { historico?: boolean }) {
  const [agent, setAgent] = useState("predictivo");
  const [view, setView] = useState<View>("pred");
  // La barra se rearma con el agente elegido: sus vistas arriba, las fijas abajo.
  const vistas: [View, string, Icono][] = [
    ...(VISTAS_AGENTE[agent] || []), ...VISTAS_FIJAS,
  ];
  const [theme, setTheme] = useState("");
  const [sesion, setSesion] = useState<{ agent: string; traza: Traza }[]>([]);
  const [up, setUp] = useState(true);
  // Compacta en cada carga: expandir es deliberado y dura lo que dura la sesión
  // de pantalla, no se persiste.
  const [anchaPorPreferencia, setAnchaPorPreferencia] = useState(false);
  const enCajon = useBarraEnCajon();
  // Una sola verdad para las dos mitades del plegado. Antes el CSS escondía las
  // etiquetas con `.compacta` mientras este componente seguía escribiendo el
  // nombre del agente, así que en un teléfono convivían un menú de iconos mudos
  // con un selector en «H»/«P»: dos idiomas para la misma barra.
  const ancha = enCajon || anchaPorPreferencia;

  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  // Salud del servicio del agente activo.
  useEffect(() => {
    let vivo = true;
    const ping = () => jget(`/api/${agent}/health`).then((r) => { if (vivo) setUp(r.ok && r.data?.status === "ok"); });
    ping(); const id = setInterval(ping, 15000);
    return () => { vivo = false; clearInterval(id); };
  }, [agent]);

  function goView(v: View) {
    setView(v);
    const a = agenteDe(v);
    if (a) setAgent(a);
  }
  function goAgent(a: string) {
    setAgent(a);
    // Si la vista abierta es de OTRO agente, saltar a la primera del elegido. Las
    // fijas se quedan: no son de nadie, y cambiar de agente mirando «Base de
    // datos» no debería moverte de pantalla.
    const duenio = agenteDe(view);
    if (duenio && duenio !== a) {
      const destino = VISTAS_AGENTE[a]?.[0]?.[0];
      if (destino) setView(destino);
    }
  }

  function toggleTheme() {
    const eff = theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(eff === "dark" ? "light" : "dark");
  }
  const addTraza = (ag: string, traza: Traza) => setSesion((s) => [...s, { agent: ag, traza }]);
  // El chat habla con el agente de la sección (goView ya sincroniza `agent`).
  const agenteActivo = AGENTES.find((a) => a.id === agent);
  const contexto = `${agenteActivo?.nombre ?? agent} · ${LABEL[view]}`;

  return (
    // `consola` marca a este cascarón como uno de los que tienen cajón. No reusa
    // `has-drawer` del cascarón de análisis porque esa clase además adelgaza la
    // barra a 184 px en tablet, y acá la barra ya arranca plegada a 60 px: quien
    // la ensancha lo pidió a propósito y no querría las etiquetas partidas en dos
    // renglones a cambio de 46 px.
    <div className="app consola">
      <ChartTooltip />
      <ConsoleDrawer
        titulo={LABEL[view]}
        claveActiva={`${agent}·${view}`}
        claseBarra={ancha ? "" : "compacta"}
      >
        <div className="brand">
          <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
            <g stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round">
              <path d="M20 4v4M20 32v4M4 20h4M32 20h4M9 9l3 3M28 28l3 3M31 9l-3 3M12 28l-3 3" />
            </g>
          </svg>
          <div className="solo-ancha"><b>AgroVoltaic</b><div className="sub muted mono">consola de evaluación</div></div>
          {/* Dentro del cajón NO se dibuja: plegar ahí no ahorraría nada y solo
              taparía las etiquetas del menú que se acaba de abrir para leer. */}
          {!enCajon && (
            <button
              className="plegar"
              onClick={() => setAnchaPorPreferencia((a) => !a)}
              data-tip={ancha ? "Plegar la barra" : "Desplegar la barra"}
              aria-label={ancha ? "Plegar la barra lateral" : "Desplegar la barra lateral"}
              aria-expanded={ancha}
            >
              <IconoPanel size={15} />
            </button>
          )}
        </div>
        <div className="agent">
          {AGENTES.map((a) => (
            <button key={a.id} className={agent === a.id ? "on" : ""}
                    onClick={() => goAgent(a.id)} data-tip={`${a.nombre}: ${a.sub}`}
                    aria-pressed={agent === a.id}>
              {ancha ? a.nombre.replace("Agente ", "") : a.inicial}
            </button>
          ))}
        </div>
        <nav className="nav">
          {vistas.map(([v, l, Icono]) => (
            <Fragment key={v}>
              {v === VISTAS_FIJAS[0][0] && <div className="navsep" />}
              <button className={"navitem" + (view === v ? " on" : "")} onClick={() => goView(v)}
                      data-tip={ancha ? undefined : l} aria-label={l}>
                <Icono size={16} />
                <span className="solo-ancha">{l}</span>
              </button>
            </Fragment>
          ))}
        </nav>
        <a className="navitem" href="/" data-tip={ancha ? undefined : "Evaluación de datos"}
           aria-label="Evaluación de datos">
          <IconoTablero size={16} />
          <span className="solo-ancha">Evaluación de datos ↗</span>
        </a>
        <a className="navitem" href="/docs" data-tip={ancha ? undefined : "Documentación"}
           aria-label="Documentación">
          <IconoDocs size={16} />
          <span className="solo-ancha">Documentación ↗</span>
        </a>
        <div className="sidefoot">
          <span className="live" data-tip={ancha ? undefined : (up ? "DB en vivo" : "servicio caído")}>
            <span className={"pulse" + (up ? "" : " off")} />
            <span className="solo-ancha">{up ? "DB en vivo" : "servicio caído"}</span>
          </span>
          <button className="tgl" onClick={toggleTheme} data-tip="Cambiar tema" aria-label="Cambiar tema">◐</button>
        </div>
      </ConsoleDrawer>

      <main className="content">
        {view === "recon" && <ReconView />}
        {view === "pred" && <PredView theme={theme} />}
        {view === "arq" && <ArqView agent={agent} />}
        {view === "calidad" && <CalidadView />}
        {view === "datos" && <DatosView />}
        {view === "perf" && <PerfView theme={theme} />}
        {view === "costo" && <CostoView agent={agent} theme={theme} sesion={sesion} />}
        {view === "salud" && <SaludView />}
        <div className="foot">
          <span>AgroVoltaic · debugger de agentes</span>
          <span>datos: Supabase PV · San Carlos (10.33°N, 84.42°O) · UTC−6</span>
        </div>
      </main>

      {(agent === "predictivo" || historico) && (
        <ChatWidget agent={agent} contexto={contexto} onTraza={addTraza} />
      )}
    </div>
  );
}

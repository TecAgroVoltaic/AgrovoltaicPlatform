"use client";
// Shell de la consola: barra lateral (agente + navegación + salud DB + tema) y el
// lienzo con la vista activa. Junta las vistas y colecciona el gasto de sesión.
//
// La barra ARRANCA COMPACTA (solo iconos) en cada carga, y expandirla es un gesto
// explícito que no se recuerda: lo que importa en esta consola son los datos, y
// una columna de 230 px de texto que nunca cambia les roba ancho a las gráficas.
// Compacta, el icono ES la etiqueta; el nombre completo aparece al pasar el mouse
// (`data-tip`, atendido por ChartTooltip, que ya está montado acá).
import { Fragment, useEffect, useState, type ComponentType } from "react";
import { jget } from "@/app/lib/client";
import { ChartTooltip } from "@/app/components/ChartTooltip";
import {
  IconoCalidad, IconoCosto, IconoDatos, IconoDocs, IconoGrafo, IconoPanel,
  IconoPrediccion, IconoReconciliar, IconoRendimiento, IconoSalud,
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
// Una sola tabla: rótulo + icono por vista. LABEL se deriva de acá para que no
// existan dos listas que se puedan separar.
const NAV: [View, string, Icono][] = [
  ["recon", "Reconciliación", IconoReconciliar],
  ["pred", "Predicción vs Real", IconoPrediccion],
  ["arq", "Arquitectura del agente", IconoGrafo],
  ["perf", "Rendimiento", IconoRendimiento],
  ["calidad", "Calidad de datos", IconoCalidad],
  ["datos", "Base de datos", IconoDatos],
  ["costo", "Costo y uso", IconoCosto],
  ["salud", "Salud del sistema", IconoSalud],
];
const LABEL = Object.fromEntries(NAV.map(([v, l]) => [v, l])) as Record<View, string>;
const AGENT_OF: Partial<Record<View, string>> = { recon: "analizador", perf: "analizador", pred: "pronostico", arq: "pronostico" };
// La navegación arranca un grupo nuevo acá (vistas transversales, no de un agente).
const SEPARADOR: View = "calidad";

/**
 * `analizador` = ¿está habilitado el agente histórico? Viene del servidor
 * (lib/agentes) via app/page.tsx. Con él apagado la consola muestra un solo
 * agente: se caen sus vistas, su hilo de chat y su selector, y el proxy
 * /api/analizador/* ya responde 503 por su cuenta.
 */
export function Console({ analizador = true }: { analizador?: boolean }) {
  const vistas = NAV.filter(([v]) => analizador || AGENT_OF[v] !== "analizador");
  const [agent, setAgent] = useState(analizador ? "analizador" : "pronostico");
  const [view, setView] = useState<View>(analizador ? "recon" : "pred");
  const [theme, setTheme] = useState("");
  const [sesion, setSesion] = useState<{ agent: string; traza: Traza }[]>([]);
  const [up, setUp] = useState(true);
  // Compacta en cada carga: expandir es deliberado y dura lo que dura la sesión
  // de pantalla, no se persiste.
  const [ancha, setAncha] = useState(false);

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
    const a = AGENT_OF[v];
    if (a) setAgent(a);
  }
  function goAgent(a: string) {
    setAgent(a);
    if (a === "pronostico" && (view === "recon" || view === "perf")) setView("pred");
    if (a === "analizador" && (view === "pred" || view === "arq")) setView("recon");
  }
  function toggleTheme() {
    const eff = theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(eff === "dark" ? "light" : "dark");
  }
  const addTraza = (ag: string, traza: Traza) => setSesion((s) => [...s, { agent: ag, traza }]);
  // El chat habla con el agente de la sección (goView ya sincroniza `agent`).
  const contexto = `${agent === "analizador" ? "Analizador PV" : "Pronóstico"} · ${LABEL[view]}`;

  return (
    <div className="app">
      <ChartTooltip />
      <aside className={"side" + (ancha ? "" : " compacta")}>
        <div className="brand">
          <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
            <g stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round">
              <path d="M20 4v4M20 32v4M4 20h4M32 20h4M9 9l3 3M28 28l3 3M31 9l-3 3M12 28l-3 3" />
            </g>
          </svg>
          <div className="solo-ancha"><b>AgroVoltaic</b><div className="sub muted mono">consola de evaluación</div></div>
          <button
            className="plegar"
            onClick={() => setAncha((a) => !a)}
            data-tip={ancha ? "Plegar la barra" : "Desplegar la barra"}
            aria-label={ancha ? "Plegar la barra lateral" : "Desplegar la barra lateral"}
            aria-expanded={ancha}
          >
            <IconoPanel size={15} />
          </button>
        </div>
        {analizador ? (
          <div className="agent">
            <button className={agent === "analizador" ? "on" : ""} onClick={() => goAgent("analizador")}
                    data-tip="Analizador PV">{ancha ? "Analizador" : "A"}</button>
            <button className={agent === "pronostico" ? "on" : ""} onClick={() => goAgent("pronostico")}
                    data-tip="Pronóstico ambiental">{ancha ? "Pronóstico" : "P"}</button>
          </div>
        ) : (
          // Un solo agente: un rótulo, no un selector de una opción.
          <div className="agent">
            <button className="on" disabled data-tip="Pronóstico ambiental">
              {ancha ? "Pronóstico ambiental" : "P"}
            </button>
          </div>
        )}
        <nav className="nav">
          {vistas.map(([v, l, Icono]) => (
            <Fragment key={v}>
              {v === SEPARADOR && <div className="navsep" />}
              <button className={"navitem" + (view === v ? " on" : "")} onClick={() => goView(v)}
                      data-tip={ancha ? undefined : l} aria-label={l}>
                <Icono size={16} />
                <span className="solo-ancha">{l}</span>
              </button>
            </Fragment>
          ))}
        </nav>
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
      </aside>

      <main className="content">
        {view === "recon" && <ReconView />}
        {view === "pred" && <PredView theme={theme} />}
        {view === "arq" && <ArqView />}
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

      <ChatWidget agent={agent} contexto={contexto} onTraza={addTraza} />
    </div>
  );
}

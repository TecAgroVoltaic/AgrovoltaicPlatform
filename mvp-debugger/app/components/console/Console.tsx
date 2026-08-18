"use client";
// Shell de la consola: barra lateral (agente + navegación + salud DB + tema) y el
// lienzo con la vista activa. Junta las 4 vistas y colecciona el gasto de sesión.
import { Fragment, useEffect, useState } from "react";
import { jget } from "@/app/lib/client";
import { ChartTooltip } from "@/app/components/ChartTooltip";
import { ReconView } from "@/app/components/console/ReconView";
import { PredView } from "@/app/components/console/PredView";
import { PerfView } from "@/app/components/console/PerfView";
import { CostoView } from "@/app/components/console/CostoView";
import { SaludView } from "@/app/components/console/SaludView";
import { ChatWidget } from "@/app/components/chat/ChatWidget";
import type { Traza } from "@/app/components/TraceViewer";

type View = "recon" | "pred" | "perf" | "costo" | "salud";
const NAV: [View, string][] = [["recon", "Reconciliación"], ["pred", "Predicción vs Real"], ["perf", "Rendimiento"], ["costo", "Costo y uso"], ["salud", "Salud del sistema"]];
const LABEL: Record<View, string> = { recon: "Reconciliación", pred: "Predicción vs Real", perf: "Rendimiento", costo: "Costo y uso", salud: "Salud del sistema" };
const AGENT_OF: Partial<Record<View, string>> = { recon: "analizador", perf: "analizador", pred: "pronostico" };

export function Console() {
  const [agent, setAgent] = useState("analizador");
  const [view, setView] = useState<View>("recon");
  const [theme, setTheme] = useState("");
  const [sesion, setSesion] = useState<{ agent: string; traza: Traza }[]>([]);
  const [up, setUp] = useState(true);

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
    if (a === "analizador" && view === "pred") setView("recon");
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
      <aside className="side">
        <div className="brand">
          <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
            <g stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round">
              <path d="M20 4v4M20 32v4M4 20h4M32 20h4M9 9l3 3M28 28l3 3M31 9l-3 3M12 28l-3 3" />
            </g>
          </svg>
          <div><b>AgroVoltaic</b><div className="sub muted mono">consola de evaluación</div></div>
        </div>
        <div className="agent">
          <button className={agent === "analizador" ? "on" : ""} onClick={() => goAgent("analizador")}>Analizador</button>
          <button className={agent === "pronostico" ? "on" : ""} onClick={() => goAgent("pronostico")}>Pronóstico</button>
        </div>
        <nav className="nav">
          {NAV.map(([v, l], i) => (
            <Fragment key={v}>
              {i === 3 && <div className="navsep" />}
              <button className={"navitem" + (view === v ? " on" : "")} onClick={() => goView(v)}>{l}</button>
            </Fragment>
          ))}
        </nav>
        <a className="navitem" href="/docs" style={{ textDecoration: "none" }}>Documentación ↗</a>
        <div className="sidefoot">
          <span className="live"><span className={"pulse" + (up ? "" : " off")} /> {up ? "DB en vivo" : "servicio caído"}</span>
          <button className="tgl" onClick={toggleTheme} title="Cambiar tema" aria-label="Cambiar tema">◐</button>
        </div>
      </aside>

      <main className="content">
        {view === "recon" && <ReconView />}
        {view === "pred" && <PredView theme={theme} />}
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

"use client";
// Chatbot flotante (bubble abajo-derecha, expandible). Un solo widget, HILOS
// SEPARADOS por agente (no se mezclan). Manda el historial de texto limpio +
// contexto de la vista a /api/<agente>/chat. Renderiza gráficos inline (de datos
// reales, marcador _grafico), un indicador con frases genéricas mientras espera,
// y una traza plegable por respuesta. Persiste por agente en localStorage.
import { useEffect, useRef, useState } from "react";
import { jpost, inlineMd } from "@/app/lib/client";
import { lineChart, palette } from "@/app/lib/charts";
import type { Traza } from "@/app/components/TraceViewer";

type Msg = { rol: "user" | "assistant"; texto: string; traza?: Traza };
type Threads = Record<string, Msg[]>;

const FRASES = [
  "Analizando tu pregunta…",
  "Consultando la base de datos…",
  "Revisando los datos reales…",
  "Buscando en la web…",
  "Armando la respuesta…",
];
const EJEMPLOS: Record<string, string[]> = {
  analizador: ["¿Cuál arreglo rinde mejor?", "Graficá la potencia por mes del 2026", "¿Qué PR es bueno en la industria?"],
  pronostico: ["¿Cuánta irradiancia en dos horas?", "Pronosticá la humedad de suelo en 1 hora"],
};

function graficoHTML(g: any): string {
  const P = palette();
  const series = g.series.map((s: any, i: number) => ({
    points: s.valores, color: i === 0 ? P.accent : P.real, name: s.nombre, area: g.series.length === 1,
  }));
  return lineChart(series, { x: g.x, height: 220, unit: g.unidad, yfmt: (v) => v.toLocaleString("es-CR", { maximumFractionDigits: 1 }) });
}

export function ChatWidget({ agent, contexto, onTraza }: {
  agent: string; contexto: string; onTraza?: (agent: string, t: Traza) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [threads, setThreads] = useState<Threads>({ analizador: [], pronostico: [] });
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [frase, setFrase] = useState(0);
  const [verTraza, setVerTraza] = useState<number | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const cur = threads[agent] || [];

  // Cargar hilos persistidos (una vez).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("agrov-chat");
      if (raw) setThreads({ analizador: [], pronostico: [], ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  // Persistir.
  useEffect(() => {
    try { localStorage.setItem("agrov-chat", JSON.stringify(threads)); } catch { /* ignore */ }
  }, [threads]);
  // Rotar frases mientras espera.
  useEffect(() => {
    if (!cargando) return;
    const id = setInterval(() => setFrase((f) => (f + 1) % FRASES.length), 1600);
    return () => clearInterval(id);
  }, [cargando]);
  // Autoscroll.
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [cur.length, cargando, abierto]);

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || cargando) return;
    const nuevo = [...cur, { rol: "user", texto: t } as Msg];
    setThreads((s) => ({ ...s, [agent]: nuevo }));
    setInput("");
    setCargando(true);
    setFrase(0);
    const historial = nuevo.map((m) => ({ rol: m.rol, texto: m.texto }));
    const r = await jpost<Traza>(`/api/${agent}/chat`, { mensajes: historial, contexto });
    setCargando(false);
    if (!r.ok) {
      setThreads((s) => ({ ...s, [agent]: [...nuevo, { rol: "assistant", texto: `Error del servicio (HTTP ${r.status}). Reintentá en un momento.` } as Msg] }));
      return;
    }
    const traza = r.data;
    setThreads((s) => ({ ...s, [agent]: [...nuevo, { rol: "assistant", texto: traza.respuesta || "(sin respuesta)", traza } as Msg] }));
    onTraza?.(agent, traza);
  }

  function limpiar() {
    setThreads((s) => ({ ...s, [agent]: [] }));
    setVerTraza(null);
  }

  const nombreAgente = agent === "analizador" ? "Analizador PV" : "Pronóstico";

  if (!abierto) {
    return (
      <button className="chat-bubble" onClick={() => setAbierto(true)} aria-label="Abrir chat">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1 3.3-11.3 8.38 8.38 0 0 1 12.8 7.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="chat-panel" role="dialog" aria-label="Chat con el agente">
      <div className="chat-head">
        <div>
          <b>Asistente</b>
          <div className="chat-sub mono">{nombreAgente} · {contexto}</div>
        </div>
        <div className="chat-headbtns">
          <button className="chat-icon" onClick={limpiar} title="Limpiar conversación" aria-label="Limpiar">↺</button>
          <button className="chat-icon" onClick={() => setAbierto(false)} title="Minimizar" aria-label="Cerrar">—</button>
        </div>
      </div>

      <div className="chat-body">
        {cur.length === 0 && (
          <div className="chat-empty">
            <p className="muted small">Preguntá sobre los datos de <b>{nombreAgente}</b>. El agente usa las tools (nunca inventa) y puede mostrar gráficos y buscar en la web para contexto.</p>
            <div className="chat-ej">
              {(EJEMPLOS[agent] || []).map((e) => (
                <button key={e} className="chip" onClick={() => enviar(e)}>{e}</button>
              ))}
            </div>
          </div>
        )}

        {cur.map((m, i) => (
          <div key={i} className={"chat-msg chat-" + m.rol}>
            <div className="chat-bub" dangerouslySetInnerHTML={{ __html: inlineMd(m.texto) }} />
            {m.rol === "assistant" && m.traza && <MsgExtras traza={m.traza} abierto={verTraza === i} onToggle={() => setVerTraza(verTraza === i ? null : i)} />}
          </div>
        ))}

        {cargando && (
          <div className="chat-msg chat-assistant">
            <div className="chat-bub chat-working"><span className="chat-dots"><i /><i /><i /></span> {FRASES[frase]}</div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); enviar(input); }}>
        <textarea rows={1} value={input} placeholder="Escribí tu pregunta…" onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(input); } }} />
        <button className="btn" type="submit" disabled={cargando || !input.trim()}>Enviar</button>
      </form>
    </div>
  );
}

function MsgExtras({ traza, abierto, onToggle }: { traza: Traza; abierto: boolean; onToggle: () => void }) {
  const pasos = (traza.pasos || []) as any[];
  const graficos = pasos.filter((p) => p.tipo === "tool" && p.salida && typeof p.salida === "object" && p.salida._grafico).map((p) => p.salida._grafico);
  const herramientas = pasos.filter((p) => p.tipo === "tool").map((p) => p.nombre);
  const webs = pasos.filter((p) => p.tipo === "web").map((p) => p.query);
  const u: any = traza.usage || {};
  return (
    <>
      {graficos.map((g, i) => (
        <div key={i} className="chat-graf">
          <div className="chat-graf-t mono">{g.titulo}{g.unidad ? ` · ${g.unidad}` : ""}</div>
          <figure dangerouslySetInnerHTML={{ __html: graficoHTML(g) }} />
        </div>
      ))}
      <div className="chat-meta">
        <button className="chat-trazabtn" onClick={onToggle}>{abierto ? "▾" : "▸"} traza</button>
        {herramientas.map((t, i) => <span key={i} className="chat-chip">{t}</span>)}
        {webs.length > 0 && <span className="chat-chip web">web ×{webs.length}</span>}
        {(traza as any).costo && <span className="chat-chip cost">${((traza as any).costo.usd_total || 0).toFixed(5)}</span>}
      </div>
      {abierto && (
        <div className="chat-traza">
          {pasos.map((p, i) => (
            <div key={i} className="chat-paso">
              {p.tipo === "tool" && <><b>{p.nombre}</b> <span className="muted">{JSON.stringify(p.input)}</span> {p.error && <span className="badge-err">ERROR</span>}</>}
              {p.tipo === "web" && <><b>web</b> <span className="muted">{p.query}</span></>}
              {p.tipo === "modelo" && p.texto && <span className="muted">{p.texto.slice(0, 90)}</span>}
            </div>
          ))}
          <div className="chat-paso muted">{u.input_tokens} in / {u.output_tokens} out · {traza.ms_total} ms{u.web_searches ? ` · ${u.web_searches} búsqueda(s) web` : ""}</div>
        </div>
      )}
    </>
  );
}

"use client";
// Chatbot flotante (bubble abajo-derecha, expandible). Un solo widget, HILOS
// SEPARADOS por agente (no se mezclan). Manda el historial de texto limpio +
// contexto de la vista a /api/<agente>/chat. Renderiza gráficos inline (de datos
// reales, marcador _grafico), un indicador con frases genéricas mientras espera,
// y una traza plegable por respuesta. Persiste por agente en localStorage.//
// Este archivo pinta el panel; los hilos y el envío viven en `useChatThreads` y
// lo que acompaña a cada respuesta en `MsgExtras`.
import { useEffect, useRef, useState } from "react";
import { IconoMinimizar } from "@/app/components/Iconos";
import { renderMd } from "@/app/lib/markdown";
import type { Traza } from "@/app/components/TraceViewer";

import { EJEMPLOS } from "./constants";
import { MsgExtras } from "./MsgExtras";
import { useChatThreads } from "./useChatThreads";

export function ChatWidget({ agent, contexto, onTraza }: {
  agent: string; contexto: string; onTraza?: (agent: string, t: Traza) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [input, setInput] = useState("");
  const [verTraza, setVerTraza] = useState<number | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const { mensajes: cur, cargando, frase, enviar: enviarPregunta, limpiar: vaciarHilo } = useChatThreads({ agent, contexto, onTraza });

  // Autoscroll.
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [cur.length, cargando, abierto]);
  // Reserva espacio a la derecha en pantallas anchas para que el panel no tape el contenido.
  useEffect(() => {
    document.body.classList.toggle("chat-abierto", abierto);
    return () => document.body.classList.remove("chat-abierto");
  }, [abierto]);

  function enviar(texto: string) {
    if (enviarPregunta(texto)) setInput("");
  }

  function limpiar() {
    vaciarHilo();
    setVerTraza(null);
  }

  const nombreAgente = agent === "historico" ? "Agente Histórico" : "Agente Predictivo";

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
          {/* `contexto` YA empieza con el nombre del agente (lo arma Console para
              mandárselo al modelo). Anteponerlo acá lo repetía: «Agente Histórico ·
              Agente Histórico · Arquitectura del agente». */}
          <div className="chat-sub mono">{contexto}</div>
        </div>
        <div className="chat-headbtns">
          <button className="chat-icon" onClick={limpiar} title="Limpiar conversación" aria-label="Limpiar">↺</button>
          <button className="chat-icon" onClick={() => setAbierto(false)} title="Minimizar" aria-label="Minimizar">
            <IconoMinimizar size={15} />
          </button>
        </div>
      </div>

      <div className="chat-body">
        {cur.length === 0 && (
          <div className="chat-empty">
            <p className="muted small">
              Preguntá lo que quieras sobre <b>{nombreAgente}</b>: sus datos, y también
              cómo está construido (qué herramientas tiene, qué umbrales usa, por qué
              decide lo que decide). Todo sale de sus tools, nunca de su memoria; puede
              mostrar gráficos y buscar en la web para contexto externo.
            </p>
            <div className="chat-ej">
              {(EJEMPLOS[agent] || []).map((e) => (
                <button key={e} className="chip" onClick={() => enviar(e)}>{e}</button>
              ))}
            </div>
          </div>
        )}

        {cur.map((m, i) => (
          <div key={i} className={"chat-msg chat-" + m.rol}>
            <div className="chat-bub md" dangerouslySetInnerHTML={{ __html: renderMd(m.texto) }} />
            {m.rol === "assistant" && m.traza && <MsgExtras traza={m.traza} abierto={verTraza === i} onToggle={() => setVerTraza(verTraza === i ? null : i)} />}
          </div>
        ))}

        {cargando && (
          <div className="chat-msg chat-assistant">            <div className="chat-bub chat-working"><span className="chat-dots"><i /><i /><i /></span> {frase}</div>
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

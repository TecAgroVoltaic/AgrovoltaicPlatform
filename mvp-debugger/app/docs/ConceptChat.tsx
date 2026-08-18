"use client";
// Mini-chat del glosario: le pregunta al Analizador PV que explique un concepto,
// con chips de arranque y repreguntas (conversación multi-turno). Pega a
// /api/analizador/chat, la misma tool que usa el widget flotante — nunca inventa,
// puede usar sus herramientas y buscar en la web para dar contexto.
import { useEffect, useRef, useState } from "react";
import { jpost, inlineMd } from "@/app/lib/client";

type Msg = { rol: "user" | "assistant"; texto: string };

// Términos del glosario para arrancar de un click.
const CONCEPTOS = [
  "GHI", "kt* (índice de claridad)", "Performance Ratio", "POA",
  "Cielo despejado (clear-sky)", "Bifacial", "Backtest",
  "Persistencia inteligente", "kWp", "Celda calibrada",
];

export function ConceptChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [meta, setMeta] = useState<{ tools: string[]; web: number } | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, cargando]);

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || cargando) return;
    const nuevo: Msg[] = [...msgs, { rol: "user", texto: t }];
    setMsgs(nuevo);
    setInput("");
    setCargando(true);
    setMeta(null);
    const historial = nuevo.map((m) => ({ rol: m.rol, texto: m.texto }));
    const r = await jpost<any>("/api/analizador/chat", { mensajes: historial, contexto: "Glosario · documentación del sistema" });
    setCargando(false);
    if (!r.ok) {
      setMsgs((s) => [...s, { rol: "assistant", texto: `No pude contactar al agente (HTTP ${r.status || "?"}). Verificá que el analizador esté corriendo.` }]);
      return;
    }
    const tz = r.data;
    setMsgs((s) => [...s, { rol: "assistant", texto: tz?.respuesta || "(sin respuesta)" }]);
    const pasos = (tz?.pasos || []) as any[];
    setMeta({
      tools: pasos.filter((p) => p.tipo === "tool").map((p) => p.nombre),
      web: pasos.filter((p) => p.tipo === "web").length,
    });
  }

  return (
    <div className="dx-ask">
      <p className="dx-ask-sub">
        Tocá un concepto o escribí tu pregunta. Responde el <strong>Analizador PV</strong> — el mismo agente
        de la consola: no inventa, y puede consultar los datos del sistema o buscar en la web para dar contexto.
        Podés repreguntar para profundizar.
      </p>

      <div className="dx-ask-chips">
        {CONCEPTOS.map((c) => (
          <button key={c} className="dx-ask-chip" disabled={cargando} onClick={() => enviar(`Explicá brevemente qué es «${c}» en el contexto de este sistema fotovoltaico.`)}>
            {c}
          </button>
        ))}
      </div>

      {msgs.length > 0 && (
        <div className="dx-ask-thread">
          {msgs.map((m, i) => (
            <div key={i} className={"dx-ask-msg " + m.rol}>
              <div className="dx-ask-bub" dangerouslySetInnerHTML={{ __html: inlineMd(m.texto) }} />
            </div>
          ))}
          {cargando && (
            <div className="dx-ask-working">
              <span className="dx-ask-dots"><i /><i /><i /></span> el agente está pensando…
            </div>
          )}
          <div ref={finRef} />
        </div>
      )}

      <form className="dx-ask-form" onSubmit={(e) => { e.preventDefault(); enviar(input); }}>
        <textarea
          className="dx-ask-input" rows={1} value={input}
          placeholder="Ej: ¿por qué el arreglo vertical genera si mira de canto?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(input); } }}
        />
        <button className="dx-ask-send" type="submit" disabled={cargando || !input.trim()}>Preguntar</button>
      </form>

      {(msgs.length > 0 || meta) && (
        <div className="dx-ask-foot">
          <div className="dx-ask-meta">
            {meta?.tools?.map((t, i) => <span key={i}>tool: {t}</span>)}
            {meta && meta.web > 0 && <span>web ×{meta.web}</span>}
          </div>
          {msgs.length > 0 && <button className="dx-ask-clear" onClick={() => { setMsgs([]); setMeta(null); }}>limpiar conversación</button>}
        </div>
      )}
    </div>
  );
}

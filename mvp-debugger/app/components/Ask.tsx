"use client";
// Caja de pregunta -> POST /api/<servicio>/preguntar -> muestra la traza.
// Reutilizable para los dos agentes (cambia el endpoint y los ejemplos).
import { useState } from "react";
import { jpost } from "@/app/lib/client";
import { TraceViewer, type Traza } from "@/app/components/TraceViewer";

export function Ask({
  endpoint,
  ejemplos,
}: {
  endpoint: string; // p.ej. "/api/analizador/preguntar"
  ejemplos: string[];
}) {
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(false);
  const [traza, setTraza] = useState<Traza | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function preguntar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || cargando) return;
    setCargando(true);
    setErr(null);
    setTraza(null);
    const r = await jpost<Traza>(endpoint, { pregunta });
    setCargando(false);
    if (!r.ok) {
      setErr(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
      return;
    }
    setTraza(r.data);
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          preguntar(q);
        }}
        className="ask-form"
      >
        <textarea
          className="ask-input"
          placeholder="Escribí una pregunta en lenguaje natural…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) preguntar(q);
          }}
        />
        <button className="btn" disabled={cargando} type="submit">
          {cargando ? "Consultando…" : "Preguntar (⌘/Ctrl+Enter)"}
        </button>
      </form>

      <div className="ejemplos">
        {ejemplos.map((ej) => (
          <button key={ej} className="chip" onClick={() => { setQ(ej); preguntar(ej); }}>
            {ej}
          </button>
        ))}
      </div>

      {err && <div className="alert">{err}</div>}
      {cargando && <div className="muted loading">El agente está razonando y llamando tools…</div>}
      <TraceViewer traza={traza} />
    </div>
  );
}

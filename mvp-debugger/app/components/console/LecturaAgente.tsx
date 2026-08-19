"use client";
// Lectura del agente sobre el momento que se está viendo, EN LA MISMA VISTA.
//
// Por qué acá y no en el chat flotante: lo que se está haciendo es validar —
// número real contra número predicho. Si la explicación aparece en un panel que
// tapa la mitad de la pantalla, se pierde justo la comparación. El widget
// flotante sigue existiendo para conversar; esto es una lectura de un tiro.
//
// Al agente se le manda la PREGUNTA, nunca los números: él llama a su
// herramienta `backtest` y de ahí salen las cifras. Pasarle los valores en el
// prompt lo convertiría en un redactor de datos que no verificó.
import { useState } from "react";
import { jpost, inlineMd } from "@/app/lib/client";

type Paso = { tipo: string; nombre?: string; query?: string };

export function LecturaAgente({ pregunta, contexto }: { pregunta: string; contexto: string }) {
  const [respuesta, setRespuesta] = useState("");
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [costo, setCosto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verTraza, setVerTraza] = useState(false);

  async function analizar() {
    setCargando(true); setError(null); setRespuesta(""); setPasos([]);
    // Un solo turno: no es una conversación, es una lectura puntual. Por eso no
    // reusa el hilo del widget (ni lo ensucia).
    const r = await jpost<any>("/api/pronostico/chat", {
      mensajes: [{ rol: "user", texto: pregunta }], contexto,
    });
    setCargando(false);
    if (!r.ok) { setError((r.data as any)?.detail || (r.data as any)?.error || `error ${r.status}`); return; }
    setRespuesta(r.data?.respuesta || "(sin respuesta)");
    setPasos(r.data?.pasos || []);
    setCosto(r.data?.costo?.usd_total ?? null);
  }

  const herramientas = pasos.filter((p) => p.tipo === "tool").map((p) => p.nombre);
  const webs = pasos.filter((p) => p.tipo === "web").length;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="lectura-head">
        <button className="btn" onClick={analizar} disabled={cargando}>
          {cargando ? "Analizando…" : respuesta ? "Volver a analizar" : "Analizar con el agente"}
        </button>
        <span className="hint" style={{ margin: 0 }}>
          Consulta la misma herramienta que ves arriba y explica el resultado.
        </span>
      </div>

      {error && <p className="hint" style={{ color: "var(--crit)" }}>{error}</p>}

      {respuesta && (
        <>
          <div className="lectura-txt"
               dangerouslySetInnerHTML={{ __html: inlineMd(respuesta).replace(/\n/g, "<br/>") }} />
          <div className="lectura-pie">
            <button className="btn-sm" onClick={() => setVerTraza((v) => !v)}>
              {verTraza ? "ocultar traza" : "ver traza"}
            </button>
            <span className="muted small mono">
              {herramientas.length ? `tools: ${herramientas.join(", ")}` : "sin tools"}
              {webs ? ` · ${webs} búsqueda${webs > 1 ? "s" : ""} web` : ""}
              {costo != null ? ` · $${costo.toFixed(5)}` : ""}
            </span>
          </div>
          {verTraza && (
            <pre className="lectura-traza">{JSON.stringify(pasos, null, 2)}</pre>
          )}
        </>
      )}
    </div>
  );
}

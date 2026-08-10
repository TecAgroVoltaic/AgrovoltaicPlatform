"use client";
// Visor de la TRAZA del agente: la pieza clave del debugger. Muestra, en orden,
// cada turno del modelo (texto + tools que pide) y cada ejecucion de tool con su
// input y su SALIDA CRUDA (para cruzar-verificar lo que el agente calculo), mas
// la respuesta final y el consumo (tokens/ms).
import { Json } from "@/app/components/Json";
import { inlineMd } from "@/app/lib/client";

export type Paso =
  | { tipo: "modelo"; texto: string; solicita: { id: string; nombre: string; input: any }[]; stop_reason: string }
  | { tipo: "tool"; nombre: string; input: any; salida: any; error: boolean; ms: number };

export type Costo = {
  modelo: string;
  usd_input: number | null;
  usd_output: number | null;
  usd_total: number | null;
  tarifa: { usd_in_por_mtok: number; usd_out_por_mtok: number } | null;
  nota?: string;
};

export type Traza = {
  pregunta: string;
  respuesta: string;
  modelo: string;
  pasos: Paso[];
  usage: { input_tokens: number; output_tokens: number; requests: number };
  costo?: Costo;
  ms_total: number;
  error?: string;
};

// USD legible (6 decimales); "n/d" si no hay tarifa para el modelo.
export function usd(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/d" : "$" + Number(v).toFixed(6);
}

export function TraceViewer({ traza }: { traza: Traza | null }) {
  if (!traza) return null;
  if (traza.error) {
    return <div className="alert">Error del servicio: {String(traza.error)}</div>;
  }

  const tools = traza.pasos.filter((p) => p.tipo === "tool") as Extract<Paso, { tipo: "tool" }>[];

  return (
    <div className="trace">
      <div className="trace-meta">
        <span className="pill">modelo: {traza.modelo}</span>
        <span className="pill">{traza.ms_total} ms</span>
        <span className="pill">{tools.length} tool call(s)</span>
        <span className="pill">
          tokens: {traza.usage?.input_tokens} in / {traza.usage?.output_tokens} out
        </span>
        <span className="pill">{traza.usage?.requests} request(s) al LLM</span>
        <span className="pill" title={traza.costo?.nota || "USD de esta consulta (tokens × tarifa)"}>
          costo: {usd(traza.costo?.usd_total)}
        </span>
      </div>

      {/* Respuesta final primero (lo que veria el usuario), luego el detalle. */}
      <div className="answer">
        <div className="answer-h">Respuesta final</div>
        <div
          className="answer-body"
          dangerouslySetInnerHTML={{ __html: inlineMd(traza.respuesta || "(vacia)") }}
        />
      </div>

      <div className="steps-h">Traza paso a paso ({traza.pasos.length})</div>
      <ol className="steps">
        {traza.pasos.map((p, i) => (
          <li key={i} className={`step step-${p.tipo}`}>
            {p.tipo === "modelo" ? (
              <div>
                <div className="step-tag">🧠 modelo · {p.stop_reason}</div>
                {p.texto && <div className="step-text">{p.texto}</div>}
                {p.solicita.length > 0 && (
                  <div className="step-calls">
                    pide:{" "}
                    {p.solicita.map((s) => (
                      <code key={s.id} className="callchip">
                        {s.nombre}({JSON.stringify(s.input)})
                      </code>
                    ))}
                  </div>
                )}
                {!p.texto && p.solicita.length === 0 && (
                  <div className="muted">(sin texto)</div>
                )}
              </div>
            ) : (
              <div>
                <div className="step-tag">
                  🔧 tool <b>{p.nombre}</b>
                  <span className="muted"> · {p.ms} ms</span>
                  {p.error && <span className="badge-err"> ERROR</span>}
                </div>
                <div className="io">
                  <div className="io-col">
                    <div className="io-h">input</div>
                    <Json value={p.input} />
                  </div>
                  <div className="io-col">
                    <div className="io-h">salida cruda</div>
                    <Json value={p.salida} collapsed={false} />
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

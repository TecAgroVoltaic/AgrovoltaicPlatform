"use client";
// Lectura del agente sobre el momento que se está viendo, EN LA MISMA VISTA.
//
// La tarjeta está armada para hacer visible la separación que sostiene todo el
// proyecto: **el agente no predice**. Predice un algoritmo determinista; el
// modelo elige cuál llamar, con qué parámetros, y explica lo que devuelve. Por
// eso el orden es: primero lo que devolvió el algoritmo (números), después lo
// que dijo el agente (texto), y al final cómo llegó ahí (traza).
//
// La verificación cruzada es el remate: los valores que recibió el agente se
// comparan con los que muestra el gráfico de arriba. Si coinciden, queda probado
// que la explicación habla de los mismos datos que estás mirando.
//
// Al agente se le manda la PREGUNTA, nunca los números: pasárselos en el prompt
// lo convertiría en un redactor de datos que no verificó.
import { useState } from "react";
import { jpost } from "@/app/lib/client";
import { renderMd } from "@/app/lib/markdown";
import { TrazaLegible } from "@/app/components/TrazaLegible";
import {
  IconoAlerta, IconoAlgoritmo, IconoCheck, IconoTexto,
} from "@/app/components/Iconos";

type Paso = any;

const TOLERANCIA = 0.05;      // los dos lados vienen redondeados a 2 decimales

const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR",
    { minimumFractionDigits: d, maximumFractionDigits: d });

type Resultado = {
  tool: string; metodo: string | null; unidad: string;
  valores: { etiqueta: string; valor: number | null; acento?: boolean }[];
  contexto: string | null;
  real: number | null; pred: number | null;
};

/**
 * Lo que devolvió el algoritmo, sacado de la traza. Se contemplan las dos formas
 * que existen hoy: `backtest` (punto reconstruido contra el real) y `forecast`
 * (valor esperado con banda). Cualquier otra tool cae en null y la tarjeta
 * simplemente no muestra el bloque de números — no inventa una lectura.
 */
function resultadoAlgoritmo(pasos: Paso[]): Resultado | null {
  const paso = pasos.find((p) => p.tipo === "tool" && !p.error
                                 && p.salida && typeof p.salida === "object");
  if (!paso) return null;
  const s = paso.salida;
  const unidad = s.unidad === "W/m2" ? "W/m²" : (s.unidad || "");

  if (s.punto_consultado) {
    const p = s.punto_consultado;
    const m = s.metricas || {};
    return {
      tool: paso.nombre, metodo: s.metodo || null, unidad,
      valores: [
        { etiqueta: "medido", valor: p.real },
        { etiqueta: "predicho", valor: p.reconstruido },
        { etiqueta: "error", valor: p.error, acento: true },
      ],
      contexto: [
        s.resumen?.maximo_real
          ? `máximo del día ${fmt(s.resumen.maximo_real.valor, 1)} a las ${s.resumen.maximo_real.t}`
          : null,
        m.mae != null ? `error medio del día ${fmt(m.mae, 1)}` : null,
        m.skill_pct != null ? `mejora sobre el ingenuo ${fmt(m.skill_pct, 0)} %` : null,
      ].filter(Boolean).join(" · ") || null,
      real: p.real, pred: p.reconstruido,
    };
  }

  if (s.valor_esperado !== undefined) {
    return {
      tool: paso.nombre, metodo: null, unidad,
      valores: [
        { etiqueta: "esperado", valor: s.valor_esperado, acento: true },
        { etiqueta: "banda baja", valor: s.banda?.bajo },
        { etiqueta: "banda alta", valor: s.banda?.alto },
      ],
      contexto: s.momento_pronosticado
        ? `para las ${String(s.momento_pronosticado).slice(11, 16)}` : null,
      real: s.medido?.valor ?? null, pred: s.valor_esperado ?? null,
    };
  }
  return null;
}

export function LecturaAgente({ pregunta, contexto, esperado }: {
  pregunta: string;
  contexto: string;
  /** Valores que muestra la vista, para la verificación cruzada. */
  esperado?: { real: number; pred: number } | null;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [costo, setCosto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verTraza, setVerTraza] = useState(false);

  async function analizar() {
    setCargando(true); setError(null); setRespuesta(""); setPasos([]); setVerTraza(false);
    // Un solo turno: no es una conversación, es una lectura puntual. Por eso no
    // reusa el hilo del widget flotante (ni lo ensucia).
    const r = await jpost<any>("/api/pronostico/chat", {
      mensajes: [{ rol: "user", texto: pregunta }], contexto,
    });
    setCargando(false);
    if (!r.ok) { setError((r.data as any)?.detail || (r.data as any)?.error || `error ${r.status}`); return; }
    setRespuesta(r.data?.respuesta || "(sin respuesta)");
    setPasos(r.data?.pasos || []);
    setUsage(r.data?.usage || null);
    setMs(r.data?.ms_total ?? null);
    setCosto(r.data?.costo?.usd_total ?? null);
  }

  const res = resultadoAlgoritmo(pasos);
  const herramientas = pasos.filter((p) => p.tipo === "tool").map((p) => p.nombre);
  const webs = pasos.filter((p) => p.tipo === "web").length;

  // Verificación cruzada: ¿el agente vio los mismos números que la vista?
  const coincide = res && esperado && res.real != null && res.pred != null
    ? Math.abs(res.real - esperado.real) <= TOLERANCIA
      && Math.abs(res.pred - esperado.pred) <= TOLERANCIA
    : null;

  return (
    <div className="card lectura">
      <div className="lectura-head">
        <div>
          <h3>Lectura del agente</h3>
          <p className="hint">
            El agente <b>no calcula</b>: elige el algoritmo, le pasa los parámetros y explica
            lo que devuelve. Acá se ve cada parte por separado.
          </p>
        </div>
        <button className="btn" onClick={analizar} disabled={cargando}>
          {cargando ? "Analizando…" : respuesta ? "Volver a analizar" : "Analizar"}
        </button>
      </div>

      {error && <p className="hint" style={{ color: "var(--crit)" }}>{error}</p>}
      {cargando && !respuesta && (
        <div className="lectura-espera">
          <span className="chat-dots"><i /><i /><i /></span>
          Eligiendo el algoritmo, ejecutándolo y redactando…
        </div>
      )}

      {res && (
        <section className="bloq bloq-algo">
          <header className="bloq-h">
            <span className="bloq-ic bloq-ic-algo"><IconoAlgoritmo size={15} /></span>
            <span className="bloq-t">Lo que devolvió el algoritmo</span>
            <code className="tz-tool">{res.tool}</code>
            {coincide !== null && (
              <span className={"bloq-check" + (coincide ? " ok" : " mal")}>
                {coincide ? <IconoCheck size={13} /> : <IconoAlerta size={13} />}
                {coincide ? "coincide con el gráfico" : "no coincide con el gráfico"}
              </span>
            )}
          </header>
          {res.metodo && <p className="bloq-metodo">{res.metodo}</p>}
          <div className="valores">
            {res.valores.map((v, i) => (
              <div className={"valor" + (v.acento ? " valor-acento" : "")} key={i}>
                <span className="valor-l">{v.etiqueta}</span>
                <span className="valor-n">
                  {v.valor != null && v.valor > 0 && v.etiqueta === "error" ? "+" : ""}
                  {fmt(v.valor, 2)}
                  <small>{res.unidad}</small>
                </span>
              </div>
            ))}
          </div>
          {res.contexto && <p className="bloq-ctx">{res.contexto}</p>}
        </section>
      )}

      {respuesta && (
        <section className="bloq bloq-agente">
          <header className="bloq-h">
            <span className="bloq-ic bloq-ic-agente"><IconoTexto size={15} /></span>
            <span className="bloq-t">Lo que dijo el agente</span>
          </header>
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(respuesta) }} />
        </section>
      )}

      {respuesta && (
        <>
          <div className="lectura-pie">
            <button className="btn-sm" onClick={() => setVerTraza((v) => !v)}>
              {verTraza ? "▾ ocultar cómo lo obtuvo" : "▸ cómo lo obtuvo"}
            </button>
            <span className="muted small mono">
              {herramientas.length ? herramientas.join(", ") : "sin algoritmos"}
              {webs ? ` · ${webs} búsqueda${webs > 1 ? "s" : ""} web` : ""}
              {ms != null ? ` · ${(ms / 1000).toFixed(1)} s` : ""}
              {costo != null ? ` · $${costo.toFixed(5)}` : ""}
            </span>
          </div>
          {verTraza && <TrazaLegible pasos={pasos} usage={usage} ms={ms} costo={costo} />}
        </>
      )}
    </div>
  );
}

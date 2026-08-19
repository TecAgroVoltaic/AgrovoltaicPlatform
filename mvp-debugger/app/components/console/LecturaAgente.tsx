"use client";
// Lectura del agente sobre el momento que se está viendo.
//
// Esta tarjeta es el único lugar de la vista donde aparece una PREDICCIÓN, y es
// deliberado: el gráfico muestra el terreno (lo medido y el techo físico), y la
// predicción se calcula cuando la pedís.
//
// Dos cosas que conviene no confundir:
//  - PROCEDENCIA: el número lo produce una herramienta determinista y auditable,
//    no la intuición del modelo. Por eso se muestran las cifras crudas, los
//    parámetros con que se la llamó y la traza.
//  - RESPONSABILIDAD: aun así, la predicción es DEL AGENTE. El prompt le pide
//    hablar en primera persona y hacerse cargo. Si se despegara ("el algoritmo
//    dijo X, yo solo lo cuento") no tendría que explicar por qué se equivocó, y
//    justamente esa explicación es lo único que aporta sobre las cifras.
//
// Orden: (1) lo que calculó la herramienta, en cifras; (2) el análisis del
// agente; (3) cómo llegó ahí. Y un sello que compara las cifras que recibió el
// agente con las que dibuja el gráfico: si no coinciden, está hablando de otros
// datos y hay que verlo.
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

type Ficha = { l: string; v: string; u?: string; acento?: boolean; nota?: string };
type Resultado = {
  tool: string; metodo: string | null; fichas: Ficha[]; contexto: string | null;
  real: number | null; pred: number | null;
};

/**
 * Lo que devolvió cada herramienta, sacado de la traza. Se contemplan las dos
 * formas que existen hoy: `backtest` (reconstrucción contra lo medido) y
 * `forecast` (valor esperado con banda). Una herramienta desconocida no rompe
 * nada: se omite su bloque de cifras y queda su paso en la traza.
 */
function resultados(pasos: Paso[]): Resultado[] {
  const salida: Resultado[] = [];
  for (const paso of pasos) {
    if (paso.tipo !== "tool" || paso.error) continue;
    const s = paso.salida;
    if (!s || typeof s !== "object") continue;
    const unidad = s.unidad === "W/m2" ? "W/m²" : (s.unidad || "");

    if (s.punto_consultado) {
      const p = s.punto_consultado;
      const m = s.metricas || {};
      const fichas: Ficha[] = [
        { l: "Predicho", v: fmt(p.reconstruido, 1), u: unidad, acento: true,
          nota: "lo que el algoritmo habría dicho" },
        { l: "Medido", v: fmt(p.real, 1), u: unidad, nota: "lo que registró el sensor" },
        { l: "Error", v: (p.error > 0 ? "+" : "") + fmt(p.error, 1), u: unidad,
          nota: "predicho − medido" },
      ];
      if (p.techo_cielo_despejado != null) {
        fichas.push({ l: "Techo", v: fmt(p.techo_cielo_despejado, 0), u: unidad,
                      nota: "máximo con cielo despejado" });
      }
      if (p.kt_estrella != null) {
        // «índice de cielo despejado», no «de claridad»: en la literatura solar
        // el clearness index es GHI/GHI_extraterrestre, que es otra cosa.
        fichas.push({ l: "Índice kt*", v: fmt(p.kt_estrella * 100, 0), u: "%",
                      nota: "del techo dejaron pasar las nubes (índice de cielo despejado)" });
      }
      if (m.mae != null) {
        fichas.push({ l: "Error medio", v: fmt(m.mae, 1), u: unidad,
                      nota: "promedio de todo el día" });
      }
      salida.push({
        tool: paso.nombre, metodo: s.metodo || null, fichas,
        contexto: s.resumen?.maximo_real
          ? `máximo del día ${fmt(s.resumen.maximo_real.valor, 1)} ${unidad} a las ${s.resumen.maximo_real.t}`
          : null,
        real: p.real, pred: p.reconstruido,
      });
      continue;
    }

    if (s.valor_esperado !== undefined) {
      salida.push({
        tool: paso.nombre, metodo: null,
        fichas: [
          { l: "Esperado", v: fmt(s.valor_esperado, 1), u: unidad, acento: true },
          { l: "Banda baja", v: fmt(s.banda?.bajo, 1), u: unidad },
          { l: "Banda alta", v: fmt(s.banda?.alto, 1), u: unidad },
          ...(s.medido ? [{ l: "Medido", v: fmt(s.medido.valor, 1), u: unidad }] : []),
        ],
        contexto: s.momento_pronosticado
          ? `para las ${String(s.momento_pronosticado).slice(11, 16)}` : null,
        real: s.medido?.valor ?? null, pred: s.valor_esperado ?? null,
      });
    }
  }
  return salida;
}

export function LecturaAgente({ pregunta, contexto, esperado }: {
  pregunta: string;
  contexto: string;
  /** Valores que dibuja el gráfico, para la verificación cruzada. */
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

  const res = resultados(pasos);
  const herramientas = pasos.filter((p) => p.tipo === "tool").map((p) => p.nombre);
  const webs = pasos.filter((p) => p.tipo === "web").length;

  // ¿El agente vio los mismos números que dibuja el gráfico?
  const primero = res[0];
  const coincide = primero && esperado && primero.real != null && primero.pred != null
    ? Math.abs(primero.real - esperado.real) <= TOLERANCIA
      && Math.abs(primero.pred - esperado.pred) <= TOLERANCIA
    : null;

  return (
    <div className="card lectura">
      <div className="lectura-head">
        <div>
          <h3>Lectura del agente</h3>
          <p className="hint">
            Acá se pide la predicción. El número lo produce una herramienta determinista (abajo se
            ve cuál y con qué parámetros), pero el agente <b>lo asume como propio</b>: lo justifica
            y lo critica.
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

      {res.map((r, i) => (
        <section className="bloq bloq-algo" key={i}>
          <header className="bloq-h">
            <span className="bloq-ic bloq-ic-algo"><IconoAlgoritmo size={15} /></span>
            <span className="bloq-t">Lo que calculó su herramienta</span>
            <code className="tz-tool">{r.tool}</code>
            {i === 0 && coincide !== null && (
              <span className={"bloq-check" + (coincide ? " ok" : " mal")}>
                {coincide ? <IconoCheck size={13} /> : <IconoAlerta size={13} />}
                {coincide ? "coincide con el gráfico" : "no coincide con el gráfico"}
              </span>
            )}
          </header>
          <div className="fichas">
            {r.fichas.map((f, j) => (
              <div className={"ficha" + (f.acento ? " ficha-acento" : "")} key={j} title={f.nota}>
                <span className="ficha-l">{f.l}</span>
                <span className="ficha-v">{f.v}{f.u && <small>{f.u}</small>}</span>
              </div>
            ))}
          </div>
          {(r.metodo || r.contexto) && (
            <p className="bloq-ctx">{[r.metodo, r.contexto].filter(Boolean).join(" · ")}</p>
          )}
        </section>
      ))}

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

"use client";
// Costo y uso: acumulado REAL del agente (GET /uso, persistido) + el gasto de la
// sesión (cada pregunta suma su costo) con gráfico acumulado, split y proyección.
import { useEffect, useState } from "react";
import { jget, type Resp } from "@/app/lib/client";
import { lineChart, palette } from "@/app/lib/charts";
import type { Traza } from "@/app/components/TraceViewer";

const fmt = (n: any, d = 1) => n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (n: number, d = 4) => "$" + (n || 0).toFixed(d);

export function CostoView({ agent, theme, sesion }: { agent: string; theme: string; sesion: { agent: string; traza: Traza }[] }) {
  const [uso, setUso] = useState<any>(null);
  const mias = sesion.filter((s) => s.agent === agent).map((s) => s.traza);

  useEffect(() => {
    jget(`/api/${agent}/uso`).then((r: Resp) => setUso(r.ok ? r.data : null));
  }, [agent, sesion.length]);

  const tarifa = (mias[0] as any)?.costo?.tarifa || { usd_in_por_mtok: 1, usd_out_por_mtok: 5 };
  const total = uso?.total_usd || 0;
  const n = uso?.n_consultas || 0;
  const usdIn = (uso?.total_input_tokens || 0) / 1e6 * tarifa.usd_in_por_mtok;
  const usdOut = (uso?.total_output_tokens || 0) / 1e6 * tarifa.usd_out_por_mtok;
  const splitTot = usdIn + usdOut || 1;
  const pIn = usdIn / splitTot * 100;
  const avg = n ? total / n : 0;

  void theme;
  const P = typeof window !== "undefined" ? palette() : ({} as any);

  // gráfico acumulado de la SESIÓN (lo que preguntaste ahora)
  let acc = 0; const cum = mias.map((t: any) => acc += (t.costo?.usd_total || 0));
  const chart = cum.length >= 2
    ? lineChart([{ points: cum, color: P.accent, area: true, name: "acumulado" }], { x: mias.map((_, i) => "#" + (i + 1)), height: 260, yfmt: (v) => "$" + v.toFixed(4), unit: "USD", tipfmt: (v) => "$" + v.toFixed(6) })
    : "";

  return (
    <section>
      <div className="phead">
        <h1>Costo y uso · {agent === "analizador" ? "Analizador" : "Pronóstico"}</h1>
        <p>Cuánto cuesta operar el agente. Acumulado real de <span className="mono">GET /uso</span> (persistido) y el gasto de esta sesión.</p>
      </div>

      <div className="card costohero">
        <div>
          <span className="lbl">Costo acumulado del agente</span>
          <div className="huge">{usd(total)}<small>USD</small></div>
          <div className="muted small">{n} consultas · {((uso?.total_input_tokens || 0) + (uso?.total_output_tokens || 0)).toLocaleString("es-CR")} tokens · promedio {usd(avg, 5)} / consulta</div>
        </div>
        <div>
          <span className="lbl">Entrada vs salida (USD)</span>
          <div className="splitbar"><span style={{ width: pIn.toFixed(1) + "%", background: P.pred }} /><span style={{ width: (100 - pIn).toFixed(1) + "%", background: P.accent }} /></div>
          <div className="legend">
            <span><span className="sw" style={{ background: P.pred }} />entrada {usd(usdIn)} ({pIn.toFixed(0)}%)</span>
            <span><span className="sw" style={{ background: P.accent }} />salida {usd(usdOut)} ({(100 - pIn).toFixed(0)}%)</span>
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Costo acumulado de la sesión</h3>
          <p className="hint">Cada pregunta que hacés en Reconciliación o Predicción suma su costo acá.</p>
          {chart ? <figure dangerouslySetInnerHTML={{ __html: chart }} />
            : <div className="muted small" style={{ padding: "20px 0" }}>Todavía no preguntaste nada en esta sesión. Hacé un par de preguntas y volvé.</div>}
        </div>
        <div className="card">
          <h3>Proyección a este ritmo</h3>
          <p className="hint">Con el costo promedio por consulta observado ({usd(avg, 5)}).</p>
          {[
            ["Por consulta (promedio)", usd(avg, 5)],
            ["Por 1.000 consultas", usd(avg * 1000, 2)],
            ["100 consultas/día ≈ mes", usd(avg * 100 * 30, 2)],
            ["Tarifa (por millón de tokens)", `$${tarifa.usd_in_por_mtok} in · $${tarifa.usd_out_por_mtok} out`],
          ].map(([l, v], i) => <div className="projrow" key={i}><span className="muted">{l}</span><span className="pv">{v}</span></div>)}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Consultas de esta sesión</h3>
        <p className="hint">Tokens del turno completo del LLM y su costo (tarifa <span className="mono">claude-haiku-4-5</span>).</p>
        <div className="scroll">
          <table className="data">
            <thead><tr><th className="lead">pregunta</th><th>tokens in</th><th>tokens out</th><th>costo USD</th></tr></thead>
            <tbody>
              {mias.length ? mias.map((t: any, i) => (
                <tr key={i}><td className="lead">{t.pregunta}</td><td>{fmt(t.usage?.input_tokens, 0)}</td><td>{fmt(t.usage?.output_tokens, 0)}</td><td>{usd(t.costo?.usd_total || 0, 6)}</td></tr>
              )) : <tr><td className="lead muted" colSpan={4}>sin consultas en esta sesión todavía</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

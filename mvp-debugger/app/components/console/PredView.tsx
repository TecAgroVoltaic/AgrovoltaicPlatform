"use client";
// Predicción vs Real: BACKTEST honesto (reconstrucción del método sobre el
// histórico real, vía /api/pronostico/backtest) + la traza de un forecast en vivo.
// Deja claro que el agente no predice de forma continua.
import { useEffect, useState } from "react";
import { jget, type Resp } from "@/app/lib/client";
import { lineChart, palette } from "@/app/lib/charts";

const fmt = (n: any, d = 1) => n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function PredView({ theme }: { theme: string }) {
  const [vari, setVari] = useState("irradiancia");
  const [dias, setDias] = useState(7);
  const [bt, setBt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setBt(null); setErr(null);
    jget(`/api/pronostico/backtest?variable=${vari}&dias=${dias}&bucket=h`).then((r: Resp) => {
      if (r.ok) setBt(r.data); else setErr(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
    });
  }, [vari, dias]);

  const unit = vari === "irradiancia" ? "W/m²" : "crudo";
  const dec = vari === "irradiancia" ? 0 : 0;
  let chart = "", metricas: any = null, det: any[] = [];
  if (bt) {
    const P = palette();
    const pts = bt.puntos as any[];
    const x = pts.map((p) => p.t.slice(5).replace(" ", " "));
    const series: any[] = [
      { points: pts.map((p) => p.real), color: P.real, area: true, width: 2.4, name: "Real (medido)" },
      { points: pts.map((p) => p.pred), color: P.pred, dash: true, width: 2.2, name: "Reconstrucción" },
    ];
    if (pts[0]?.cs != null) series.push({ points: pts.map((p) => p.cs), color: P.ceil, width: 1.4, name: "Cielo despejado" });
    // theme referenciado para recomputar al cambiar tema
    void theme;
    chart = lineChart(series, { x, height: 340, yfmt: (v) => fmt(v, 0), unit, tipfmt: (v) => fmt(v, dec) });
    metricas = bt.metricas;
    det = pts.map((p) => ({ t: p.t.slice(5), real: p.real, pred: p.pred, e: p.pred - p.real }))
      .sort((a, b) => Math.abs(b.e) - Math.abs(a.e)).slice(0, 14);
  }

  const P = typeof window !== "undefined" ? palette() : ({} as any);

  return (
    <section>
      <div className="phead">
        <h1>Predicción vs Real</h1>
        <p>Qué tan cerca estuvo el método del modelo de lo que de verdad midió el sensor.</p>
      </div>

      <div className="banner">
        <div><b>Esto es un backtest, no predicciones en vivo.</b> El agente no pronostica de forma continua: predice solo cuando se le llama. Esta curva <b>reaplica el método</b> (persistencia del índice de claridad kt*) sobre el histórico real del store para evaluarlo. Una evaluación con predicciones reales usa la tabla de auditoría <span className="mono">predicciones</span>.</div>
      </div>

      <div className="controls">
        <div className="ctl"><span className="lbl">Variable</span>
          <div className="chips">
            {[["irradiancia", "Irradiancia"], ["humedad_suelo", "Humedad de suelo"]].map(([v, l]) => (
              <button key={v} className={"chip" + (vari === v ? " on" : "")} onClick={() => setVari(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="ctl"><span className="lbl">Ventana</span>
          <div className="chips">
            {[3, 7, 14].map((d) => (
              <button key={d} className={"chip" + (dias === d ? " on" : "")} onClick={() => setDias(d)}>{d} días</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Backtest {vari === "irradiancia" ? "de irradiancia" : "de humedad de suelo"} · horario</h3>
        <p className="hint">{bt ? bt.metodo : "cargando…"} — contra el sensor, últimos {dias} días.</p>
        {err && <div className="alert">{err}</div>}
        {chart && <>
          <figure dangerouslySetInnerHTML={{ __html: chart }} />
          <div className="legend">
            <span><span className="sw" style={{ background: P.real }} />Real (medido)</span>
            <span><span className="sw" style={{ background: P.pred }} />Reconstrucción del método</span>
            {bt.puntos[0]?.cs != null && <span><span className="sw" style={{ background: P.ceil }} />Cielo despejado (techo)</span>}
          </div>
        </>}
      </div>

      {metricas && (
        <div className="grid g4" style={{ marginTop: 16 }}>
          {[
            { l: "Error medio absoluto", v: fmt(metricas.mae, 1), u: unit, d: "promedio de |recon − real|" },
            { l: "Sesgo (bias)", v: (metricas.bias >= 0 ? "+" : "") + fmt(metricas.bias, 1), u: unit, d: "+ sobreestima · − subestima" },
            { l: "Error relativo", v: fmt(metricas.error_rel_pct, 1), u: "%", d: "MAE sobre el promedio real" },
            { l: "Skill vs. ingenuo", v: (metricas.skill_pct >= 0 ? "+" : "") + fmt(metricas.skill_pct, 0), u: "%", d: "mejora sobre “igual que antes”" },
          ].map((k, i) => (
            <div className="kpi" key={i}><span className="lbl">{k.l}</span><div className="k">{k.v}<small>{k.u}</small></div><div className="d">{k.d}</div></div>
          ))}
        </div>
      )}

      {det.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Desglose · mayores desvíos</h3>
          <p className="hint">Dónde el método se alejó más de lo medido.</p>
          <div className="scroll">
            <table className="data">
              <thead><tr><th className="lead">momento</th><th>real {unit}</th><th>reconstruido</th><th>error</th></tr></thead>
              <tbody>{det.map((r, i) => (
                <tr key={i}><td className="lead">{r.t}</td><td>{fmt(r.real, dec)}</td><td>{fmt(r.pred, dec)}</td>
                  <td style={{ color: r.e >= 0 ? "var(--pred)" : "var(--crit)" }}>{r.e >= 0 ? "+" : ""}{fmt(r.e, dec)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="note">Para pedir un pronóstico en vivo, preguntale al asistente (abajo a la derecha): traduce el horizonte, ejecuta <span className="mono">forecast</span> y redacta — la traza muestra el input y la salida cruda.</div>
    </section>
  );
}

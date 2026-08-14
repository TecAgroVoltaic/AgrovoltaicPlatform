"use client";
// Rendimiento: KPIs reales (tools del analizador) + series vía /datos/serie.
// Honesto: el gráfico de "potencia" es potencia media por bucket (robusta a la
// cadencia variable); la energía real en kWh vive en el KPI.
import { useEffect, useState } from "react";
import { jget, jpost, extraerLista, mensajeError, type Resp } from "@/app/lib/client";
import { Estado } from "@/app/components/console/Estado";
import { lineChart, scatter, palette } from "@/app/lib/charts";
import { PERIODS, VARS, q, fmt } from "@/app/components/console/perfCatalogo";

export function PerfView({ theme }: { theme: string }) {
  const [kpi, setKpi] = useState<any>(null);
  const [vari, setVari] = useState("pot");
  const [period, setPeriod] = useState("y2026");
  const [cmp, setCmp] = useState("ambos");
  const [series, setSeries] = useState<any>(null);
  const [scat, setScat] = useState<[number, number][] | null>(null);
  const [errKpi, setErrKpi] = useState<string | null>(null);
  const [errSerie, setErrSerie] = useState<string | null>(null);
  const [errScat, setErrScat] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    Promise.all([
      jpost("/api/analizador/tool/energia_por_arreglo", {}),
      jpost("/api/analizador/tool/performance_ratio", {}),
      jpost("/api/analizador/tool/irradiancia_resumen", {}),
      jpost("/api/analizador/tool/temperatura_por_arreglo", {}),
    ]).then(([e, pr, g, t]: Resp[]) => {
      const fallidas = [e, pr, g, t].filter((r) => !r.ok);
      setErrKpi(fallidas.length ? mensajeError(fallidas[0]) : null);
      setKpi({ e: e.data || {}, pr: pr.data || {}, g: g.data || {}, t: t.data || {} });
    }).catch((e) => setErrKpi(String(e?.message || e)));
  }, [intento]);

  const V = VARS[vari], P = PERIODS[period];
  useEffect(() => {
    setSeries(null); setErrSerie(null);
    Promise.all(V.cols.map(([c]) => jget(q(V.tabla, c, P)))).then((rs: Resp[]) => {
      const extraidas = rs.map((r) => extraerLista(r, "puntos"));
      const fallida = extraidas.find((e) => e.error);
      if (fallida) { setErrSerie(fallida.error); return; }
      setSeries({
        labels: extraidas[0].lista.map((p: any) => String(p.t).slice(2, 10)),
        cols: extraidas.map((e) => e.lista.map((p: any) => p.v)),
      });
    }).catch((e) => setErrSerie(String(e?.message || e)));
  }, [vari, period, intento]);

  useEffect(() => {
    setScat(null); setErrScat(null);
    Promise.all([jget(q("radiacion_calibrada", "irradiancia_incidente_wm2", P)), jget(q("electrico_corregido", "potencia_pv1_w", P))]).then(([g, pw]: Resp[]) => {
      const ghi = extraerLista(g, "puntos"), pot = extraerLista(pw, "puntos");
      if (ghi.error || pot.error) { setErrScat(ghi.error || pot.error); return; }
      const pm = Object.fromEntries(pot.lista.map((p: any) => [p.t, p.v]));
      setScat(ghi.lista.filter((p: any) => pm[p.t] != null && p.v != null && pm[p.t] > 0).map((p: any) => [p.v, pm[p.t]] as [number, number]));
    }).catch((e) => setErrScat(String(e?.message || e)));
  }, [period, intento]);

  void theme;
  const Pal = typeof window !== "undefined" ? palette() : ({} as any);
  const kpis = kpi ? [
    { l: "Energía PV1 · histórico", v: fmt(kpi.e.energia_pv1_inclinado_wh / 1000, 1), u: "kWh", d: "arreglo inclinado 20°/150°" },
    { l: "Energía PV2 · histórico", v: fmt(kpi.e.energia_pv2_vertical_wh / 1000, 1), u: "kWh", d: "arreglo vertical 90°/50°" },
    { l: "Performance Ratio", v: fmt(kpi.pr.pr_pv1_inclinado, 2), u: "", d: `PV1 ${fmt(kpi.pr.pr_pv1_inclinado, 3)} · PV2 ${fmt(kpi.pr.pr_pv2_vertical, 3)}` },
    { l: "GHI media · kt*", v: fmt(kpi.g.ghi_media_wm2, 0), u: "W/m²", d: `índice de claridad ${fmt(kpi.g.kt_star_medio, 2)}` },
  ] : [];

  const colors = [Pal.accent, Pal.real];
  let chart = "";
  if (series) {
    const cols = cmp === "ambos" || !V.cmp ? V.cols.map((_, i) => i) : cmp === "pv1" ? [0] : [1];
    const lines = cols.map((i) => ({ points: series.cols[i] || [], color: colors[i], name: V.cols[i][1], area: cols.length === 1 }));
    void theme;
    chart = lineChart(lines, { x: series.labels, height: 360, yfmt: (v) => fmt(v, V.dec), unit: V.unit, tipfmt: (v) => fmt(v, V.dec) });
  }

  return (
    <section>
      <div className="phead">
        <h1>Rendimiento del sistema</h1>
        <p>Generación, irradiancia y eficiencia por arreglo — PV1 inclinado vs PV2 vertical (bifacial). Datos vivos de la Supabase PV.</p>
      </div>

      {errKpi ? (
        <Estado error={errKpi} que="los indicadores" onReintentar={() => setIntento((i) => i + 1)} />
      ) : (
        <div className="grid g4">
          {kpis.length ? kpis.map((k, i) => (
            <div className="kpi" key={i}><span className="lbl">{k.l}</span><div className="k">{k.v}<small>{k.u}</small></div><div className="d">{k.d}</div></div>
          )) : [0, 1, 2, 3].map((i) => <div className="kpi" key={i}><span className="lbl muted">cargando…</span><div className="k">—</div></div>)}
        </div>
      )}

      <div className="controls">
        <div className="ctl"><span className="lbl">Período</span>
          <div className="chips">{Object.entries(PERIODS).map(([k, p]) => <button key={k} className={"chip" + (period === k ? " on" : "")} onClick={() => setPeriod(k)}>{p.label}</button>)}</div>
        </div>
        <div className="ctl"><span className="lbl">Variable</span>
          <div className="chips">{Object.entries(VARS).map(([k, v]) => <button key={k} className={"chip" + (vari === k ? " on" : "")} onClick={() => setVari(k)}>{v.label}</button>)}</div>
        </div>
        {V.cmp && <div className="ctl"><span className="lbl">Comparar</span>
          <div className="chips">{[["ambos", "PV1 y PV2"], ["pv1", "Solo PV1"], ["pv2", "Solo PV2"]].map(([k, l]) => <button key={k} className={"chip" + (cmp === k ? " on" : "")} onClick={() => setCmp(k)}>{l}</button>)}</div>
        </div>}
      </div>

      <div className="card">
        <h3>{V.label}{vari === "pot" ? " media por arreglo" : " diaria"}</h3>
        <p className="hint">{vari === "pot" ? "Potencia media por período (robusta a la cadencia variable de muestreo)." : "Promedio por período."} · {P.label}</p>
        {chart ? <><figure dangerouslySetInnerHTML={{ __html: chart }} />
          <div className="legend">{(cmp === "ambos" || !V.cmp ? V.cols : cmp === "pv1" ? [V.cols[0]] : [V.cols[1]]).map(([, name], i) => <span key={i}><span className="sw" style={{ background: colors[V.cols.findIndex((c) => c[1] === name)] }} />{name}</span>)}</div>
        </> : (
          <Estado cargando={!series && !errSerie} error={errSerie}
                  vacio={!!series && !chart} que="la serie" pista="Probá otro período."
                  onReintentar={() => setIntento((i) => i + 1)} />
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Correlación irradiancia → potencia PV1</h3>
        <p className="hint">Cada punto es un período: cuánto explica el sol la generación. · {P.label}</p>
        {scat && scat.length ? (
          <figure dangerouslySetInnerHTML={{ __html: scatter(scat, { height: 320 }) }} />
        ) : (
          <Estado cargando={!scat && !errScat} error={errScat}
                  vacio={!!scat && scat.length === 0} que="la correlación"
                  pista="Puede que no haya solape entre irradiancia y potencia en este período."
                  onReintentar={() => setIntento((i) => i + 1)} />
        )}
      </div>
    </section>
  );
}

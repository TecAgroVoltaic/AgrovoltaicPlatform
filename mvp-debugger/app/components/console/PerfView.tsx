"use client";
// Rendimiento: KPIs reales (tools del analizador) + series vía /datos/serie.
// Honesto: el gráfico de "potencia" es potencia media por bucket (robusta a la
// cadencia variable); la energía real en kWh vive en el KPI.
import { useEffect, useState } from "react";
import { jget, jpost, extraerLista, mensajeError, type Resp } from "@/app/lib/client";
import { Estado } from "@/app/components/console/Estado";
import { lineChart, scatter, palette } from "@/app/lib/charts";
import { ajusteLineal, atipicosBajos, depurar, CONSTANTE_SOLAR, type Punto } from "@/app/lib/regresion";
import { PERIODS, VARS, q, fmt, quéEsUnPunto, avisoParcial } from "@/app/components/console/perfCatalogo";

export function PerfView({ theme }: { theme: string }) {
  const [kpi, setKpi] = useState<any>(null);
  const [vari, setVari] = useState("pot");
  const [period, setPeriod] = useState("y2026");
  const [cmp, setCmp] = useState("ambos");
  const [series, setSeries] = useState<any>(null);
  const [scat, setScat] = useState<Punto[] | null>(null);
  const [errKpi, setErrKpi] = useState<string | null>(null);
  const [errSerie, setErrSerie] = useState<string | null>(null);
  const [errScat, setErrScat] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    Promise.all([
      jpost("/api/historico/tool/energia_por_arreglo", {}),
      jpost("/api/historico/tool/performance_ratio", {}),
      jpost("/api/historico/tool/irradiancia_resumen", {}),
      jpost("/api/historico/tool/temperatura_por_arreglo", {}),
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

  // La nube de puntos SIEMPRE va por día, aunque la serie de arriba esté en
  // semanas o meses. No es una inconsistencia: promediando un mes, el día que
  // generó de menos se diluye entre los otros veintinueve, y ese día es justo lo
  // que este gráfico existe para encontrar. Un promedio no tiene dispersión que
  // mirar.
  const diario = { ...P, bucket: "day" };
  useEffect(() => {
    setScat(null); setErrScat(null);
    Promise.all([
      jget(q("radiacion_calibrada", "irradiancia_incidente_wm2", diario)),
      jget(q("electrico_corregido", "potencia_pv1_w", diario)),
    ]).then(([g, pw]: Resp[]) => {
      const ghi = extraerLista(g, "puntos"), pot = extraerLista(pw, "puntos");
      if (ghi.error || pot.error) { setErrScat(ghi.error || pot.error); return; }
      const pm = Object.fromEntries(pot.lista.map((p: any) => [p.t, p.v]));
      setScat(ghi.lista
        .filter((p: any) => pm[p.t] != null && p.v != null && pm[p.t] > 0 && p.v > 0)
        .map((p: any) => ({ x: p.v, y: pm[p.t], etiqueta: String(p.t).slice(0, 10) })));
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

  // El ajuste sale de los puntos, no del servidor: es aritmética sobre lo que ya
  // se descargó, y hacerla acá evita un viaje y que dos sitios calculen distinto.
  const { usables, descartados } = depurar(scat || []);
  const ajuste = scat ? ajusteLineal(usables) : null;
  const bajos = ajuste ? atipicosBajos(usables, ajuste) : [];

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
        <p>Generación, irradiancia y eficiencia por arreglo: PV1 inclinado vs PV2 vertical (bifacial). Datos vivos de la Supabase PV.</p>
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
          <div className="chips">{Object.entries(PERIODS).map(([k, p]) => <button key={k} className={"chip" + (period === k ? " on" : "")} onClick={() => setPeriod(k)}>{p.label} <span className="chip-sub">{p.grano}</span></button>)}</div>
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
        <p className="hint">
          {quéEsUnPunto(P)}
          {vari === "pot" ? ", que es robusto a la cadencia variable de muestreo" : ""}. · {P.label}
          {avisoParcial(P) ? <><br />{avisoParcial(P)}</> : null}
        </p>
        {chart ? <><figure dangerouslySetInnerHTML={{ __html: chart }} />
          <div className="legend">{(cmp === "ambos" || !V.cmp ? V.cols : cmp === "pv1" ? [V.cols[0]] : [V.cols[1]]).map(([, name], i) => <span key={i}><span className="sw" style={{ background: colors[V.cols.findIndex((c) => c[1] === name)] }} />{name}</span>)}</div>
        </> : (
          <Estado cargando={!series && !errSerie} error={errSerie}
                  vacio={!!series && !chart} que="la serie" pista="Probá otro período."
                  onReintentar={() => setIntento((i) => i + 1)} />
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Potencia PV1 frente a irradiancia</h3>
        <p className="hint">
          Un punto por <strong>día</strong>. La recta es el ajuste por mínimos cuadrados;
          los días marcados quedan muy por debajo.
          {ajuste ? <> · <b>R² {fmt(ajuste.r2, 2)}</b> sobre {ajuste.n} días
            {" "}· pendiente {fmt(ajuste.m, 2)} W por W/m²</> : null} · {P.label}
        </p>
        {scat && usables.length && ajuste ? (
          <>
            <figure dangerouslySetInnerHTML={{ __html: scatter(
              usables.map((p) => [p.x, p.y] as [number, number]),
              { height: 320, xUnit: "W/m²", yUnit: "W", linea: ajuste,
                etiquetas: usables.map((p) => p.etiqueta),
                marcas: bajos.map((a) => ({
                  x: a.punto.x, y: a.punto.y, etiqueta: a.punto.etiqueta,
                  nota: `${fmt(a.punto.y, 0)} W con ${fmt(a.punto.x, 0)} W/m²: `
                    + `${fmt(a.faltante, 0)} W por debajo de lo esperado`,
                })) }) }} />
            {descartados.length ? (
              <p className="hint" style={{ marginTop: 10 }}>
                <b>{descartados.length} {descartados.length === 1 ? "día excluido" : "días excluidos"}</b>:
                {" "}irradiancia superior a la constante solar ({CONSTANTE_SOLAR} W/m²), dato
                inválido.{" "}
                {descartados.slice(0, 3).map((d) => `${d.etiqueta} (${fmt(d.x, 0)} W/m²)`).join(" · ")}.
              </p>
            ) : null}
            {bajos.length ? (
              <p className="hint" style={{ marginTop: 10 }}>
                <b>{bajos.length} {bajos.length === 1 ? "día" : "días"} por debajo del
                ajuste:</b>{" "}
                {bajos.slice(0, 5).map((a) => `${a.punto.etiqueta} (−${fmt(a.faltante, 0)} W)`).join(" · ")}
                {bajos.length > 5 ? ` y ${bajos.length - 5} más` : ""}.
              </p>
            ) : (
              <p className="hint" style={{ marginTop: 10 }}>
                Ningún día se aparta lo suficiente del ajuste.
              </p>
            )}
          </>
        ) : (
          <Estado cargando={!scat && !errScat} error={errScat}
                  vacio={!!scat && !ajuste} que="la comparación con el sol"
                  pista="Hacen falta al menos 3 días con irradiancia Y potencia el mismo día."
                  onReintentar={() => setIntento((i) => i + 1)} />
        )}
      </div>
    </section>
  );
}

"use client";
// Rendimiento: KPIs reales (tools del analizador) + series vía /datos/serie.
// Honesto: el gráfico de "potencia" es potencia media por bucket (robusta a la
// cadencia variable); la energía real en kWh vive en el KPI.
import { useEffect, useMemo, useState } from "react";
import { jget, jpost, extraerLista, mensajeError, type Resp } from "@/app/lib/client";
import { Estado } from "@/app/components/console/Estado";
import { lineChart, scatter, palette } from "@/app/lib/charts";
import { ajusteLineal, atipicosBajos, depurar, CONSTANTE_SOLAR, type Punto } from "@/app/lib/regresion";
import { agrupar, alinear, completar, divergencias, recortar, type PuntoSerie } from "@/app/lib/serie";
import { PERIODS, VARS, q, fmt, quéEsUnPunto, avisoParcial } from "@/app/components/console/perfCatalogo";

export function PerfView({ theme }: { theme: string }) {
  const [kpi, setKpi] = useState<any>(null);
  const [vari, setVari] = useState("pot");
  const [period, setPeriod] = useState("y2026");
  const [cmp, setCmp] = useState("ambos");
  const [scat, setScat] = useState<Punto[] | null>(null);
  // ── Una sola descarga por columna, y siempre DIARIA y de todo el histórico ──
  //
  // Antes cada cambio de período o de variable disparaba de nuevo las series al
  // grano elegido: cinco viajes por clic, para datos que ya estaban. Ahora se
  // baja la serie diaria completa de cada columna una vez y TODO lo demás se
  // deriva acá: recortar el período es filtrar, y reagrupar a semana o mes es
  // promediar ponderando por lecturas.
  //
  // Derivar es EXACTO, no una aproximación: como `n` es cuántas lecturas tuvo
  // cada día, el promedio ponderado de los promedios diarios da el mismo número
  // que el promedio del tramo entero. La consola no puede discrepar del servicio.
  //
  // Y son datos chicos: una columna diaria de todo el histórico son unos cientos
  // de filas. Lo caro era la cantidad de viajes, no el tamaño.
  const [diarias, setDiarias] = useState<Record<string, PuntoSerie[]>>({});
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

  // Las columnas que hacen falta. Las tres primeras van siempre: la nube de
  // puntos y la referencia «lo que su sol predice» las necesitan con cualquier
  // variable elegida.
  const necesarias: [string, string][] = [
    ["radiacion_calibrada", "irradiancia_incidente_wm2"],
    ["electrico_corregido", "potencia_pv1_w"],
    ["electrico_corregido", "potencia_pv2_w"],
    ...V.cols.map(([c]) => [V.tabla, c] as [string, string]),
  ];
  const clave = (t: string, c: string) => `${t}.${c}`;
  // Sin deduplicar, con la variable «Potencia» las dos columnas del arreglo
  // aparecen dos veces (van en la lista fija Y en las de la variable) y se
  // pedirían por duplicado en la primera carga.
  const faltan = [...new Set(necesarias.map(([t, c]) => clave(t, c)))]
    .filter((k) => !(k in diarias));
  const pendiente = faltan.join(",");

  useEffect(() => {
    if (!pendiente) return;
    const pedir = pendiente.split(",").map((k) => k.split("."));
    Promise.all(pedir.map(([t, c]) => jget(q(t, c, { bucket: "day" }))))
      .then((rs: Resp[]) => {
        const nuevas: Record<string, PuntoSerie[]> = {};
        for (let i = 0; i < rs.length; i++) {
          const e = extraerLista(rs[i], "puntos");
          if (e.error) { setErrSerie(e.error); setErrScat(e.error); return; }
          nuevas[pedir[i].join(".")] = e.lista.map((p: any) =>
            ({ t: String(p.t).slice(0, 10), v: p.v, n: p.n ?? 0 }));
        }
        setErrSerie(null); setErrScat(null);
        setDiarias((d) => ({ ...d, ...nuevas }));
      })
      .catch((e) => { setErrSerie(String(e?.message || e)); });
  }, [pendiente, intento]);

  const ghiDiaria = diarias[clave("radiacion_calibrada", "irradiancia_incidente_wm2")];
  const listo = !faltan.length;

  // La serie que se dibuja: recortar al período, reagrupar al grano y completar
  // los tramos vacíos. Sin red: es aritmética sobre lo ya descargado, así que
  // cambiar de período o de variable ya no espera nada.
  const series = useMemo(() => {
    if (!listo) return null;
    const llenas = V.cols.map(([c]) =>
      completar(agrupar(recortar(diarias[clave(V.tabla, c)], P.desde, P.hasta), P.bucket), P.bucket));
    if (!llenas[0]?.length) return null;
    return {
      fechas: llenas[0].map((p) => p.t),
      labels: llenas[0].map((p) => p.t.slice(2)),
      cols: llenas.map((l) => l.map((p) => p.v)),
      muestras: llenas[0].map((p) => p.n),
    };
  }, [listo, diarias, vari, period]);

  // La nube de puntos: siempre por día, siempre del período elegido.
  useEffect(() => {
    if (!listo) { setScat(null); return; }
    const pv1 = new Map(recortar(diarias[clave("electrico_corregido", "potencia_pv1_w")],
                                 P.desde, P.hasta).map((p) => [p.t, p.v]));
    setScat(recortar(ghiDiaria, P.desde, P.hasta)
      .filter((g) => g.v != null && g.v > 0 && (pv1.get(g.t) ?? 0) > 0)
      .map((g) => ({ x: g.v as number, y: pv1.get(g.t) as number, etiqueta: g.t })));
  }, [listo, diarias, period]);

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

  // ── La referencia: qué potencia predice el sol de cada tramo ────────────────
  //
  // Es lo que convierte la serie en un diagnóstico. Una caída de potencia sola no
  // distingue «hubo menos sol» de «algo se rompió», y hasta ahora había que
  // alternar entre las variables «Potencia» e «Irradiancia» y comparar de
  // memoria, que es justo lo que un gráfico debería ahorrar.
  //
  // La referencia se calcula con el ajuste DIARIO de cada arreglo aplicado a la
  // irradiancia del tramo. Vale hacerlo así porque la recta es lineal: el
  // promedio de `m·x + b` es `m·(promedio de x) + b`, así que ajustar por día y
  // evaluar por semana es exacto, no una aproximación.
  const referencia = useMemo(() => {
    if (vari !== "pot" || !listo || !series) return null;
    const ghiPeriodo = recortar(ghiDiaria, P.desde, P.hasta);
    const ghiTramo = alinear(agrupar(ghiPeriodo, P.bucket), series.fechas);
    const rectas = (["potencia_pv1_w", "potencia_pv2_w"] as const).map((col) => {
      const pot = new Map(recortar(diarias[clave("electrico_corregido", col)], P.desde, P.hasta)
        .map((p) => [p.t, p.v]));
      const pares: Punto[] = ghiPeriodo
        .filter((g) => g.v != null && g.v <= CONSTANTE_SOLAR && (pot.get(g.t) ?? 0) > 0)
        .map((g) => ({ x: g.v as number, y: pot.get(g.t) as number, etiqueta: g.t }));
      return ajusteLineal(pares);
    });
    if (!rectas[0]) return null;
    return {
      esperadas: rectas.map((r) =>
        r ? ghiTramo.map((g) => (g == null ? null : r.m * g + r.b)) : null),
      rectas,
    };
  }, [vari, listo, series, diarias, period]);

  // Tramos donde lo medido se despegó de lo esperado. Solo se miran los arreglos
  // que están en pantalla: señalar una caída de PV2 mientras se mira «Solo PV1»
  // manda a revisar algo que no se está viendo.
  const visibles = cmp === "ambos" || !V.cmp ? [0, 1] : cmp === "pv1" ? [0] : [1];
  const despegues = referencia && series
    ? visibles.flatMap((i) => {
        const esp = referencia.esperadas[i];
        return esp
          ? divergencias(series.cols[i], esp, series.fechas).map((d) => ({ ...d, arreglo: V.cols[i][1] }))
          : [];
      }).sort((a, b) => b.caida - a.caida)
    : [];

  const colors = [Pal.accent, Pal.real];
  let chart = "";
  if (series) {
    const cols = visibles;
    const lines: any[] = cols.map((i) => ({ points: series.cols[i] || [], color: colors[i], name: V.cols[i][1], area: cols.length === 1 }));
    // La referencia va punteada y más fina: es el patrón contra el que se mide,
    // no una medición más.
    if (referencia) {
      for (const i of cols) {
        const esp = referencia.esperadas[i];
        if (esp) lines.push({ points: esp, color: colors[i], name: `${V.cols[i][1]} esperado`, dash: true, width: 1.4, r: 0, area: false });
      }
    }
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
        <h3>{vari === "pot" ? "Generación frente a su sol" : `${V.label} en el tiempo`}</h3>
        <p className="hint">
          {quéEsUnPunto(P)}.
          {vari === "pot"
            ? " La línea punteada es la potencia que predice la irradiancia de ese tramo:"
              + " lo que se despega de ella no es clima."
            : ""} · {P.label}
          {avisoParcial(P) ? <><br />{avisoParcial(P)}</> : null}
        </p>
        {chart ? <><figure dangerouslySetInnerHTML={{ __html: chart }} />
          <div className="legend">
            {visibles.map((i) => <span key={i}><span className="sw" style={{ background: colors[i] }} />{V.cols[i][1]}</span>)}
            {referencia ? <span><span className="sw sw-ref" />esperado por su sol</span> : null}
          </div>
          {despegues.length ? (
            <p className="hint" style={{ marginTop: 10 }}>
              <b>{despegues.length} {despegues.length === 1 ? "tramo" : "tramos"} por debajo de
              su referencia:</b>{" "}
              {despegues.slice(0, 4).map((d) => `${d.t} ${d.arreglo} (−${Math.round(d.caida * 100)} %)`).join(" · ")}
              {despegues.length > 4 ? ` y ${despegues.length - 4} más` : ""}.
            </p>
          ) : referencia ? (
            <p className="hint" style={{ marginTop: 10 }}>
              La generación siguió a la irradiancia en todos los tramos con datos.
            </p>
          ) : null}
          {series && series.muestras.some((n: number) => n === 0) ? (
            <p className="hint" style={{ marginTop: 6 }}>
              Los cortes de la línea son tramos <b>sin ninguna lectura</b>
              {" "}({series.muestras.filter((n: number) => n === 0).length} de {series.muestras.length}).
              Antes se unían con una recta y el hueco no se veía.
            </p>
          ) : null}
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

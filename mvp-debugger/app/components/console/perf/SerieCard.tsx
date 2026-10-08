import { Estado } from "@/app/components/console/Estado";
import { avisoParcial, fmt, quéEsUnPunto } from "@/app/components/console/perfCatalogo";
import { lineChart, palette } from "@/app/lib/charts";
import { divergencias } from "@/app/lib/serie";
import { SerieNotas } from "./SerieNotas";
import type { Periodo, Referencia, SerieDibujada, Variable } from "./tipos";

const ALTO_DEL_GRAFICO = 360;

/** La serie del período frente a lo que predice su sol, con los tramos que se despegan. */
export function SerieCard({ vari, V, P, cmp, series, referencia, errSerie, onReintentar }: {
  vari: string; V: Variable; P: Periodo; cmp: string;
  series: SerieDibujada | null; referencia: Referencia | null;
  errSerie: string | null; onReintentar: () => void;
}) {
  const Pal = typeof window !== "undefined" ? palette() : ({} as any);

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
    chart = lineChart(lines, { x: series.labels, height: ALTO_DEL_GRAFICO, yfmt: (v) => fmt(v, V.dec), unit: V.unit, tipfmt: (v) => fmt(v, V.dec) });
  }

  return (
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
        <SerieNotas despegues={despegues} conReferencia={!!referencia} series={series} />
      </> : (
        <Estado cargando={!series && !errSerie} error={errSerie}
                vacio={!!series && !chart} que="la serie" pista="Probá otro período."
                onReintentar={onReintentar} />
      )}
    </div>
  );
}

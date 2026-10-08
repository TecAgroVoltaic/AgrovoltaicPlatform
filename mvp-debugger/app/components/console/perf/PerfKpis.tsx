import { Estado } from "@/app/components/console/Estado";
import { fmt } from "@/app/components/console/perfCatalogo";

const WH_POR_KWH = 1000;
const LUGARES_DE_CARGA = [0, 1, 2, 3];

function kpisDe(kpi: any) {
  return [
    { l: "Energía PV1 · histórico", v: fmt(kpi.e.energia_pv1_inclinado_wh / WH_POR_KWH, 1), u: "kWh", d: "arreglo inclinado 20°/150°" },
    { l: "Energía PV2 · histórico", v: fmt(kpi.e.energia_pv2_vertical_wh / WH_POR_KWH, 1), u: "kWh", d: "arreglo vertical 90°/50°" },
    { l: "Performance Ratio", v: fmt(kpi.pr.pr_pv1_inclinado, 2), u: "", d: `PV1 ${fmt(kpi.pr.pr_pv1_inclinado, 3)} · PV2 ${fmt(kpi.pr.pr_pv2_vertical, 3)}` },
    { l: "GHI media · kt*", v: fmt(kpi.g.ghi_media_wm2, 0), u: "W/m²", d: `índice de claridad ${fmt(kpi.g.kt_star_medio, 2)}` },
  ];
}

/** Los cuatro indicadores del histórico, o su estado de carga o error. */
export function PerfKpis({ kpi, errKpi, onReintentar }: {
  kpi: any; errKpi: string | null; onReintentar: () => void;
}) {
  if (errKpi) return <Estado error={errKpi} que="los indicadores" onReintentar={onReintentar} />;
  const kpis = kpi ? kpisDe(kpi) : [];
  return (
    <div className="grid g4">
      {kpis.length ? kpis.map((k, i) => (
        <div className="kpi" key={i}><span className="lbl">{k.l}</span><div className="k">{k.v}<small>{k.u}</small></div><div className="d">{k.d}</div></div>
      )) : LUGARES_DE_CARGA.map((i) => <div className="kpi" key={i}><span className="lbl muted">cargando…</span><div className="k">—</div></div>)}
    </div>
  );
}

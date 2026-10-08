// Cuántas filas y cuánto pesaría la exportación, o por qué no se puede.
import { formatBytes, formatCount } from "@/app/lib/descargas/format";

import { minuteOf } from "./helpers";
import type { ExportEstimateState } from "./useExportEstimate";

type EstimatePanelProps = {
  readonly estimate: ExportEstimateState;
  readonly rows: number;
  readonly sizeBytes: number;
  readonly exceedsMat: boolean;
};

export function EstimatePanel({ estimate: state, rows, sizeBytes, exceedsMat }: EstimatePanelProps) {
  const { estimate, error, estimating } = state;
  return (
    <div className="dl-est">
      {estimating ? <div className="muted loading" style={{ margin: 0 }}>estimando…</div>
      : error ? <div className="alert" style={{ margin: 0 }}>{error}</div>
      : estimate ? (
        <>
          <div className="metric"><span className="v">{estimate.cota ? "≈ " : ""}{formatCount(rows)}</span><span className="muted small">filas{estimate.cota ? " (estimado)" : ""} · ≈ {formatBytes(sizeBytes)}</span></div>
          {rows > 0 && estimate.primero && <div className="muted small mono" style={{ marginTop: 4 }}>{minuteOf(estimate.primero)} → {minuteOf(estimate.ultimo)}</div>}
          {estimate.cota && <div className="muted small" style={{ marginTop: 4 }}>{estimate.sensores ?? 0} sensores · la API no cuenta filas: la cifra es aproximada.</div>}
          {rows === 0 && <div className="muted small" style={{ marginTop: 4 }}>Sin filas en este rango.</div>}
        </>
      ) : <div className="muted small">Elegí un rango.</div>}
      {exceedsMat && !error && <div className="alert" style={{ marginBottom: 0 }}>Supera el tope del .mat: acortá el rango o usá CSV/DAT.</div>}
    </div>
  );
}

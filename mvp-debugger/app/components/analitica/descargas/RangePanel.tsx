// Paso «Rango»: desde y hasta dentro de la cobertura del conjunto, con atajos
// y una barra que muestra dónde cae lo elegido.
import { formatCount } from "@/app/lib/descargas/format";

import { AccordionStep } from "./AccordionStep";
import { RANGE_PRESET_LABELS } from "./constants";
import { coverageBar, daysBetween, minuteOf } from "./helpers";
import type { RangePresetId, StepFrame } from "./types";

type RangePanelProps = StepFrame & {
  readonly hasTime: boolean;
  readonly from: string;
  readonly to: string;
  readonly invalid: boolean;
  readonly coverageStart: string;
  readonly coverageEnd: string;
  /** Último instante con dato del conjunto, para cuando no hay barra. */
  readonly lastReading: string | null | undefined;
  readonly onFromChange: (value: string) => void;
  readonly onToChange: (value: string) => void;
  readonly onPreset: (preset: RangePresetId) => void;
};

export function RangePanel(props: RangePanelProps) {
  const { hasTime, from, to, invalid, coverageStart, coverageEnd, lastReading, onFromChange, onToChange, onPreset, ...frame } = props;
  const bar = hasTime ? coverageBar(coverageStart, coverageEnd, from, to) : null;
  const summary = hasTime
    ? <span className="mono">{from || "?"} → {to || "?"}{from && to && !invalid ? <span className="muted"> · {formatCount(daysBetween(from, to) + 1)} días</span> : null}</span>
    : <span className="muted">tabla completa</span>;

  return (
    <AccordionStep {...frame} title="Rango" summary={summary}>
      {hasTime ? (
        <>
          <div className="dl-dates">
            <label className="ctl"><span className="lbl">Desde</span>
              <input className="input" type="date" value={from} min={coverageStart || undefined} max={to || coverageEnd || undefined} onChange={(e) => onFromChange(e.target.value)} /></label>
            <label className="ctl"><span className="lbl">Hasta</span>
              <input className="input" type="date" value={to} min={from || coverageStart || undefined} max={coverageEnd || undefined} onChange={(e) => onToChange(e.target.value)} /></label>
            <div className="chips" style={{ paddingBottom: 6 }}>
              {RANGE_PRESET_LABELS
                .filter(([p]) => p !== "todo" || !!coverageStart)
                .map(([p, l]) => <button key={p} className="chip sm" onClick={() => onPreset(p)}>{l}</button>)}
            </div>
          </div>
          {bar ? (
            <div className="range">
              <div className="range-track"><div className={"range-sel" + (bar.outside ? " warn" : "")} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} /></div>
              <div className="range-lbl mono"><span>{coverageStart}</span><span>{coverageEnd}</span></div>
            </div>
          ) : coverageEnd ? <div className="muted small mono" style={{ marginTop: 10 }}>último dato: {minuteOf(lastReading)}</div> : null}
          {invalid && <div className="alert">«Hasta» es anterior a «Desde».</div>}
        </>
      ) : <div className="muted small">Sin columna de tiempo: se descarga completa.</div>}
    </AccordionStep>
  );
}

// Paso «Filtros»: cajas, tipos de sensor y, si el conjunto la admite, la
// resolución temporal.
import { useMemo } from "react";

import { AccordionStep } from "./AccordionStep";
import { STEP_LABEL } from "./constants";
import { summarizeSelection, toggleInSet } from "./helpers";
import { SearchablePicker } from "./SearchablePicker";
import type { PickerItem, SensorBox, StepFrame } from "./types";

type FiltersPanelProps = StepFrame & {
  readonly sensorBoxes: SensorBox[];
  readonly boxes: Set<string>;
  readonly onBoxesChange: (boxes: Set<string>) => void;
  readonly types: Set<string>;
  readonly onTypesChange: (types: Set<string>) => void;
  /** Resoluciones que admite el conjunto; vacío si no admite ninguna. */
  readonly steps: number[];
  readonly step: number;
  readonly onStepChange: (step: number) => void;
};

export function FiltersPanel({
  sensorBoxes, boxes, onBoxesChange, types, onTypesChange, steps, step, onStepChange, ...frame
}: FiltersPanelProps) {
  const hasStep = steps.length > 0;
  const boxItems: PickerItem[] = useMemo(() => {
    const byBox = new Map<string, Set<string>>();
    sensorBoxes.forEach((c) => byBox.set(c.caja, (byBox.get(c.caja) ?? new Set()).add(c.sensor_tipo)));
    return [...byBox.entries()].map(([box, t]) => ({ k: box, label: box, meta: `${t.size} tipos` }));
  }, [sensorBoxes]);
  const typeItems: PickerItem[] = useMemo(() => {
    const byType = new Map<string, number>();
    sensorBoxes.forEach((c) => byType.set(c.sensor_tipo, (byType.get(c.sensor_tipo) ?? 0) + c.sensores));
    return [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, n]) => ({ k: t, label: t, meta: `${n} sensores` }));
  }, [sensorBoxes]);
  const summary = <>{summarizeSelection(boxes, "todas las cajas")} <span className="muted">·</span> {summarizeSelection(types, "todos los tipos")}{hasStep && <><span className="muted"> ·</span> {STEP_LABEL[step]}</>}</>;

  return (
    <AccordionStep {...frame} title="Filtros" summary={summary}>
      <div className="lbl" style={{ marginBottom: 6 }}>Cajas</div>
      <SearchablePicker items={boxItems} selected={boxes} onToggle={(k) => onBoxesChange(toggleInSet(boxes, k))} onClear={() => onBoxesChange(new Set())} placeholder="Buscar caja…" emptyMeans="todas" />
      <div className="lbl" style={{ margin: "14px 0 6px" }}>Tipos de sensor</div>
      <SearchablePicker items={typeItems} selected={types} onToggle={(k) => onTypesChange(toggleInSet(types, k))} onClear={() => onTypesChange(new Set())} placeholder="Buscar tipo…" emptyMeans="todos" />
      {hasStep && (
        <>
          <div className="lbl" style={{ margin: "14px 0 6px" }}>Resolución</div>
          <div className="chips">
            {steps.map((p) => (
              <button key={p} className={"chip sm" + (p === step ? " on" : "")} onClick={() => onStepChange(p)}>{STEP_LABEL[p] ?? `${p} s`}</button>
            ))}
          </div>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            {step === 0 ? "Una fila por lectura. Lento en rangos largos con muchos sensores." : `Promedio por intervalo y sensor (+ n, mínimo, máximo, desvío).`}
          </p>
        </>
      )}
    </AccordionStep>
  );
}

// Paso «Datos»: qué conjunto de la fuente se exporta.
import { AccordionStep } from "./AccordionStep";
import { dayOf } from "./helpers";
import type { ExportDataset, StepFrame } from "./types";

type DatasetPickerProps = StepFrame & {
  readonly datasets: ExportDataset[];
  readonly selected: ExportDataset | null;
  readonly onChoose: (key: string) => void;
};

export function DatasetPicker({ datasets, selected, onChoose, ...frame }: DatasetPickerProps) {
  const summary = selected ? <>{selected.titulo} <span className="muted">· {selected.columnas.length} col.</span></> : "—";
  return (
    <AccordionStep {...frame} title="Datos" summary={summary}>
      <div className="optlist">
        {datasets.map((d) => (
          <button key={d.clave} className={"opt row" + (d.clave === selected?.clave ? " on" : "")} onClick={() => onChoose(d.clave)} title={d.descripcion}>
            <span className="optt">{d.titulo}</span>
            <span className="optm mono">{d.columnas.length} col. · {d.columna_tiempo ? `hasta ${dayOf(d.hasta) || "?"}` : "sin fechas"}</span>
          </button>
        ))}
      </div>
      {selected?.descripcion && <p className="muted small" style={{ margin: "10px 0 0" }}>{selected.descripcion}</p>}
    </AccordionStep>
  );
}

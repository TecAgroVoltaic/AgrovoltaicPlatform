// Paso «Formato»: CSV, DAT o MAT, con lo que trae cada uno.
import { formatCount } from "@/app/lib/descargas/format";

import { AccordionStep } from "./AccordionStep";
import { EXPORT_FORMATS } from "./constants";
import type { ExportFormat, StepFrame } from "./types";

type FormatPickerProps = StepFrame & {
  readonly format: ExportFormat;
  readonly onChange: (format: ExportFormat) => void;
  /** Tope de filas del .mat que publica el catálogo. */
  readonly maxMatRows: number;
};

export function FormatPicker({ format, onChange, maxMatRows, ...frame }: FormatPickerProps) {
  return (
    <AccordionStep {...frame} title="Formato" summary={<span className="mono">.{format}</span>}>
      <div className="chips">
        {EXPORT_FORMATS.map((f) => <button key={f.k} className={"chip" + (f.k === format ? " on" : "")} onClick={() => onChange(f.k)}>{f.l}</button>)}
      </div>
      <p className="muted small" style={{ margin: "8px 0 0" }}>{EXPORT_FORMATS.find((f) => f.k === format)?.d}{format === "mat" ? ` · tope ${formatCount(maxMatRows)} filas` : ""}</p>
    </AccordionStep>
  );
}

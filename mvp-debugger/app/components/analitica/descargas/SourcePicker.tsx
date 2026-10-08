// Paso «Fuente»: Supabase PV o la API de AgroDash; las no disponibles se ven
// apagadas con su motivo.
import { AccordionStep } from "./AccordionStep";
import type { ExportSource, StepFrame } from "./types";

type SourcePickerProps = StepFrame & {
  readonly sources: ExportSource[];
  readonly selectedKey: string;
  readonly summary: string;
  readonly onChoose: (key: string) => void;
};

export function SourcePicker({ sources, selectedKey, summary, onChoose, ...frame }: SourcePickerProps) {
  return (
    <AccordionStep {...frame} title="Fuente" summary={summary}>
      <div className="seg">
        {sources.map((f) => (
          <button key={f.clave} className={"segbtn" + (f.clave === selectedKey ? " on" : "") + (f.disponible ? "" : " off")}
                  onClick={() => onChoose(f.clave)} disabled={!f.disponible} title={f.disponible ? f.descripcion : `No disponible · ${f.motivo}`}>
            <span className="segt"><span className={"dot " + (f.disponible ? "ok" : "bad")} />{f.titulo}</span>
            <span className="segd">{f.disponible ? `${f.datasets.length} conjuntos de datos` : "no disponible"}</span>
          </button>
        ))}
      </div>
    </AccordionStep>
  );
}

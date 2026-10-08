// Un paso del acordeón de Descargas: cerrado resume su valor en una línea,
// abierto muestra su contenido.
import type { ReactNode } from "react";

import type { StepFrame } from "./types";

type AccordionStepProps = StepFrame & { readonly title: string; readonly summary: ReactNode; readonly children: ReactNode };

export function AccordionStep({ number, title, summary, open, onToggle, children }: AccordionStepProps) {
  return (
    <div className={"acc" + (open ? " open" : "")}>
      <button className="acc-h" onClick={onToggle} aria-expanded={open}>
        <span className="stepn">{number}</span>
        <span className="acc-t">{title}</span>
        <span className="acc-sum">{summary}</span>
        <span className="acc-chev" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="acc-b">{children}</div>}
    </div>
  );
}

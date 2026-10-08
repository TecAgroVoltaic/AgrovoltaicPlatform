import type { ReactNode } from "react";

// Fórmula destacada. El proyecto no usa KaTeX ni MathJax y no hace falta: estas
// expresiones son de una línea, así que una librería de matemáticas sería una
// dependencia nueva a cambio de nada. `nota` lleva la definición de símbolos.
export function Formula({ nota, children }: { nota?: ReactNode; children: ReactNode }) {
  return (
    <div className="dx-formula">
      <div className="expr mono">{children}</div>
      {nota && <div className="nota">{nota}</div>}
    </div>
  );
}

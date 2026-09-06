// EL patrón de divulgación de las vistas de análisis: `<details>` nativo.
//
// Se elige `<details>` y no un popover por tres razones que no son de gusto:
// funciona sin JavaScript (estas vistas son Server Components), el navegador ya
// le da foco, teclado y estado abierto/cerrado sin ARIA a mano, y el buscador de
// la página encuentra el texto de dentro aunque esté plegado.
//
// Qué va acá dentro: lo metodológico correcto que nadie necesita para leer un
// número (cómo se mide algo, por qué dos cifras no se suman). Lo que trae un
// número o dice qué hacer NUNCA se pliega.
import type { ReactNode } from "react";

import styles from "@/app/components/analitica/disclosure.module.css";

export type DisclosureProps = {
  /** La pregunta que se contesta al abrirlo, no un «Ver más». */
  readonly label: string;
  readonly children: ReactNode;
};

export function Disclosure({ label, children }: DisclosureProps) {
  return (
    <details className={styles.disclosure}>
      <summary className={styles.summary}>{label}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

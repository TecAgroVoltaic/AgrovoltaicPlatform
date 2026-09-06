// La etiqueta de gravedad. Nunca es solo un color: signo + palabra, siempre.
//
// El signo va con `aria-hidden` porque la palabra ya está escrita al lado: un
// lector de pantalla que dijera "triángulo negro apuntando arriba, grave" hace
// ruido sin añadir nada.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { SEVERITY_BADGE, SEVERITY_INK } from "@/app/components/analitica/calidad/labels";
import type { Severity } from "@/app/lib/analitica/contracts/calidad";

export type SeverityTagProps = {
  readonly severity: Severity;
  /** Qué significa esa gravedad. Se muestra al pie, no en cada fila. */
  readonly withMeaning?: boolean;
};

export function SeverityTag({ severity, withMeaning = false }: SeverityTagProps) {
  const badge = SEVERITY_BADGE[severity];
  return (
    <span className={`${styles.sevTag} ${SEVERITY_INK[severity]}`}>
      <span className={styles.sevGlyph} aria-hidden="true">
        {badge.glyph}
      </span>
      {badge.label}
      {withMeaning ? (
        <span className={`muted small ${styles.sevMeaning}`}>({badge.meaning})</span>
      ) : null}
    </span>
  );
}

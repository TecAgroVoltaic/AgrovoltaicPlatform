// De dónde sale lo que se está mirando: una píldora discreta con el punto de
// color de la fuente y su nombre corto. El detalle va en el tooltip.
import { sourceInfo, type SourceId } from "@/app/lib/fuentes/registry";
import styles from "@/app/components/fuentes/sourceBadge.module.css";

export type SourceBadgeProps = {
  readonly source: SourceId;
};

export function SourceBadge({ source }: SourceBadgeProps) {
  const info = sourceInfo(source);
  return (
    <span className={styles.badge} data-tone={info.tone} title={info.description}>
      <span className={styles.srOnly}>Fuente: </span>
      {info.label}
    </span>
  );
}

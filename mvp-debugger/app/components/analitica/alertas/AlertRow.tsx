// Una alerta en la lista: la fila entera es un botón que abre la ficha. No hay
// acciones en la fila a propósito, para que la lista se lea de un vistazo y
// decidir algo pase siempre por ver la evidencia.
import type { MouseEvent } from "react";

import { IconChevronRight } from "@/app/components/asistente/AssistantIcons";
import { headlineFigures } from "@/app/components/analitica/alertas/figures";
import { countLabel, momentLabel, severityLabel, variableShortLabel } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/list.module.css";
import { StatusPill } from "@/app/components/analitica/alertas/StatusPill";
import { dateSpanLabel } from "@/app/lib/analitica/rangeLabel";
import type { Alert } from "@/app/lib/alertas/contracts";

const CHEVRON_SIZE = 16;
const CHEVRON_STROKE = 2;

export type AlertRowProps = {
  readonly alert: Alert;
  readonly selected: boolean;
  /** Recibe además la fila, para devolverle el foco al cerrar la ficha. */
  readonly onSelect: (id: number, opener: HTMLElement) => void;
};

export function AlertRow({ alert, selected, onSelect }: AlertRowProps) {
  const headline = headlineFigures(alert.evidence.figures);
  const unseenCritical = alert.status === "new" && alert.severity === "critical";
  return (
    <button
      type="button"
      className={styles.row}
      data-unseen={unseenCritical || undefined}
      aria-current={selected ? "true" : undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => onSelect(alert.id, event.currentTarget)}
    >
      <span className={styles.bar} data-severity={alert.severity} aria-hidden="true" />
      <span className={styles.main}>
        <span className={styles.title}>
          <span className={styles.srOnly}>{severityLabel(alert.severity)}: </span>
          {alert.title}
        </span>
        {headline ? <span className={`${styles.cell} ${styles.headline}`}>{headline}</span> : null}
      </span>
      <span className={styles.variable}>
        <code className={styles.code}>{variableShortLabel(alert.variable)}</code>
      </span>
      <span className={`${styles.cell} ${styles.dates}`}>
        <span className={styles.mono}>{dateSpanLabel(alert.firstDate, alert.lastDate, false)}</span>
        {" · "}
        <span title="Días en que se vio la condición">{countLabel(alert.occurrences, "día", "días")}</span>
      </span>
      <span className={styles.status}>
        <StatusPill status={alert.status} severity={alert.severity} />
      </span>
      <span className={`${styles.cell} ${styles.activity}`} title="Última actividad">
        {momentLabel(alert.updatedAt)}
      </span>
      <span className={styles.chevron} aria-hidden="true">
        <IconChevronRight size={CHEVRON_SIZE} strokeWidth={CHEVRON_STROKE} />
      </span>
    </button>
  );
}

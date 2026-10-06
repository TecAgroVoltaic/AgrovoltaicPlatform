// La línea de datos de una alerta: estado, variable, días y ocurrencias. La
// comparten la fila de la lista y la cabecera de la ficha, para que las dos
// digan lo mismo con las mismas palabras.
import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { STATUS_LABEL, variableLabel } from "@/app/components/analitica/alertas/labels";
import type { Alert } from "@/app/lib/alertas/contracts";

export type AlertSummaryLineProps = {
  readonly alert: Alert;
  readonly withNextReview?: boolean;
};

/** `fecha_fin` es INCLUSIVA en el contrato: se muestra tal cual, sin restar. */
function dateSpan(alert: Alert): string {
  return alert.firstDate === alert.lastDate ? alert.firstDate : `${alert.firstDate} a ${alert.lastDate}`;
}

function occurrencesLabel(occurrences: number): string {
  return occurrences === 1 ? "1 día" : `${occurrences} días`;
}

export function AlertSummaryLine({ alert, withNextReview = false }: AlertSummaryLineProps) {
  return (
    <span className={styles.meta}>
      <span className={styles.status} data-status={alert.status}>
        {STATUS_LABEL[alert.status]}
      </span>
      <span className="mono">{variableLabel(alert.variable)}</span>
      <span className="mono">{dateSpan(alert)}</span>
      <span title="Días en que se vio la condición">{occurrencesLabel(alert.occurrences)}</span>
      {withNextReview && alert.nextReview ? (
        <span>Próxima revisión: <span className="mono">{alert.nextReview}</span></span>
      ) : null}
    </span>
  );
}

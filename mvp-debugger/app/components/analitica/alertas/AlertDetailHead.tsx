// La cabecera de la ficha: gravedad como barra, estado y tipo, el título y los
// hechos de la alerta (variable, fechas, ocurrencias, próxima revisión).
import { countLabel, severityLabel, variableLabel } from "@/app/components/analitica/alertas/labels";
import { StatusPill } from "@/app/components/analitica/alertas/StatusPill";
import styles from "@/app/components/analitica/alertas/drawer.module.css";
import listStyles from "@/app/components/analitica/alertas/list.module.css";
import { dateSpanLabel } from "@/app/lib/analitica/rangeLabel";
import type { Alert } from "@/app/lib/alertas/contracts";
import { fechaCorta } from "@/app/lib/tiempo";

export type AlertDetailHeadProps = {
  readonly alert: Alert;
  readonly titleId: string;
};

export function AlertDetailHead({ alert, titleId }: AlertDetailHeadProps) {
  return (
    <header className={styles.head}>
      <span className={styles.bar} data-severity={alert.severity} aria-hidden="true" />
      <div className={styles.headText}>
        <p className={styles.headLine}>
          <StatusPill status={alert.status} severity={alert.severity} />
          <span className={styles.kind}>
            {severityLabel(alert.severity)} · {alert.type}
          </span>
        </p>
        <h2 id={titleId} className={styles.title}>
          {alert.title}
        </h2>
        <p className={styles.facts}>
          <code className={listStyles.code}>{variableLabel(alert.variable)}</code>
          <span>
            {dateSpanLabel(alert.firstDate, alert.lastDate)} ·{" "}
            {countLabel(alert.occurrences, "ocurrencia", "ocurrencias")}
          </span>
          {alert.nextReview ? <span>Próxima revisión: {fechaCorta(alert.nextReview, true)}</span> : null}
        </p>
      </div>
    </header>
  );
}

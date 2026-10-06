// El estado de una alerta como píldora discreta: borde y fondo neutros y un
// punto de color. El punto de una nueva toma el color de su gravedad, porque
// una grave sin ver y un aviso sin ver no piden la misma urgencia.
import styles from "@/app/components/analitica/alertas/list.module.css";
import { STATUS_LABEL } from "@/app/components/analitica/alertas/labels";
import type { AlertSeverity, AlertStatus } from "@/app/lib/alertas/vocabulary";

export type StatusPillProps = {
  readonly status: AlertStatus;
  readonly severity: AlertSeverity;
};

export function StatusPill({ status, severity }: StatusPillProps) {
  return (
    <span className={styles.pill} data-status={status} data-severity={severity}>
      {STATUS_LABEL[status]}
    </span>
  );
}

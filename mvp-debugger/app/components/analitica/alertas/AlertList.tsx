// La lista compacta: una línea por alerta. La fila entera es un botón que abre
// la ficha; no hay acciones en la fila a propósito, para que la lista se lea de
// un vistazo y decidir algo pase siempre por ver la evidencia.
import type { MouseEvent } from "react";

import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { AlertSummaryLine } from "@/app/components/analitica/alertas/AlertSummaryLine";
import { SeverityTag } from "@/app/components/analitica/calidad/SeverityTag";
import type { Alert } from "@/app/lib/alertas/contracts";

export type AlertListProps = {
  readonly alerts: readonly Alert[];
  readonly selectedId: number | null;
  /** Recibe además la fila, para devolverle el foco al cerrar la ficha. */
  readonly onSelect: (id: number, opener: HTMLElement) => void;
};

export function AlertList({ alerts, selectedId, onSelect }: AlertListProps) {
  return (
    <ul className={styles.list} aria-label="Alertas">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <button
            type="button"
            className={styles.row}
            aria-current={alert.id === selectedId ? "true" : undefined}
            onClick={(event: MouseEvent<HTMLButtonElement>) => onSelect(alert.id, event.currentTarget)}
          >
            <SeverityTag severity={alert.severity} />
            <span className={styles.rowTitle}>{alert.title}</span>
            <AlertSummaryLine alert={alert} />
          </button>
        </li>
      ))}
    </ul>
  );
}

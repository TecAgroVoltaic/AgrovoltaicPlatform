// La lista: cabecera de columnas (solo visual: cada fila ya se nombra entera) y
// una fila por alerta, en el orden del servicio (graves primero, la más
// reciente arriba). El orden no se toca acá.
import { AlertRow, type AlertRowProps } from "@/app/components/analitica/alertas/AlertRow";
import styles from "@/app/components/analitica/alertas/list.module.css";
import type { Alert } from "@/app/lib/alertas/contracts";

export type AlertListProps = {
  readonly alerts: readonly Alert[];
  readonly selectedId: number | null;
  readonly onSelect: AlertRowProps["onSelect"];
};

export function AlertList({ alerts, selectedId, onSelect }: AlertListProps) {
  return (
    <>
      <div className={styles.columns} aria-hidden="true">
        <span />
        <span>Alerta</span>
        <span>Variable</span>
        <span>Fechas · días</span>
        <span>Estado</span>
        <span className={styles.columnActivity}>Última actividad</span>
        <span />
      </div>
      <ul className={styles.list} aria-label="Alertas">
        {alerts.map((alert) => (
          <li key={alert.id}>
            <AlertRow alert={alert} selected={alert.id === selectedId} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </>
  );
}

// Paginación de la lista. Aritmética de paginación solamente: el total y el
// siguiente desplazamiento los publica el servicio.
import styles from "@/app/components/analitica/alertas/alertas.module.css";
import type { AlertsPage } from "@/app/lib/alertas/contracts";

const FIRST_OFFSET = 0;
const COUNT_FORMAT = new Intl.NumberFormat("es-CR");

export type AlertsPagerProps = {
  readonly page: AlertsPage;
  readonly onGoTo: (offset: number) => void;
};

export function AlertsPager({ page, onGoTo }: AlertsPagerProps) {
  const { offset, limit, nextOffset } = page.page;
  const first = offset + 1;
  const last = offset + page.alerts.length;
  const previousOffset = Math.max(FIRST_OFFSET, offset - limit);

  return (
    <div className={styles.pager}>
      <button
        className="btn-sm"
        type="button"
        disabled={offset === FIRST_OFFSET}
        onClick={() => onGoTo(previousOffset)}
      >
        Anteriores
      </button>
      <p className="muted small" role="status">
        {COUNT_FORMAT.format(first)} a {COUNT_FORMAT.format(last)} de {COUNT_FORMAT.format(page.total)}{" "}
        alertas
      </p>
      <button
        className="btn-sm"
        type="button"
        disabled={nextOffset === null}
        onClick={() => onGoTo(nextOffset ?? offset)}
      >
        Siguientes
      </button>
    </div>
  );
}

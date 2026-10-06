// La línea de tiempo de una alerta, en el orden en que la entrega el servicio.
// La hora va en la del SITIO (`tiempo.ts`), no en la de quien mira: un
// seguimiento anotado en San Carlos se lee igual desde cualquier parte.
import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { EVENT_LABEL } from "@/app/components/analitica/alertas/labels";
import type { AlertEvent } from "@/app/lib/alertas/contracts";
import { ETIQUETA_ZONA, instanteEnSitio } from "@/app/lib/tiempo";

export type AlertTimelineProps = { readonly events: readonly AlertEvent[] };

export function AlertTimeline({ events }: AlertTimelineProps) {
  return (
    <section className={styles.block} aria-labelledby="alerta-historial">
      <h3 id="alerta-historial" className="lbl">
        Historial <span className={styles.zone}>({ETIQUETA_ZONA})</span>
      </h3>
      {events.length === 0 ? (
        <p className="muted small">El servicio no registró eventos para esta alerta.</p>
      ) : (
        <ol className={styles.timeline}>
          {events.map((event) => (
            <li key={event.id} className={styles.event}>
              <p className={styles.eventHead}>
                <b>{EVENT_LABEL[event.type]}</b>
                <span className="muted small mono">
                  {instanteEnSitio(event.createdAt)} · {event.author}
                </span>
              </p>
              {event.note ? <p className={`small ${styles.eventNote}`}>{event.note}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

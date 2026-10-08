// La línea de tiempo de una alerta, en el orden en que la entrega el servicio:
// un punto con icono por evento, qué pasó, la nota y quién y cuándo. La hora va
// en la del SITIO (`tiempo.ts`), no en la de quien mira.
import type { ReactNode } from "react";

import {
  IconCheck,
  IconChat,
  IconClock,
  IconClose,
  IconPlus,
  IconRefresh,
} from "@/app/components/asistente/AssistantIcons";
import { IconoCampana } from "@/app/components/Iconos";
import { EVENT_LABEL, momentLabel } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/drawer.module.css";
import { isIsoDate } from "@/app/lib/analitica/dateRange";
import type { AlertEvent } from "@/app/lib/alertas/contracts";
import type { AlertEventType } from "@/app/lib/alertas/vocabulary";
import { ETIQUETA_ZONA, fechaCorta } from "@/app/lib/tiempo";

const ICON_SIZE = 11;
const ICON_STROKE = 2.4;

const EVENT_ICON: Readonly<Record<AlertEventType, ReactNode>> = {
  created: <IconoCampana size={ICON_SIZE} />,
  occurrence: <IconPlus size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  acknowledged: <IconCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  followUp: <IconClock size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  note: <IconChat size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  resolved: <IconCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  dismissed: <IconClose size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  reopened: <IconRefresh size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
};

/** El generador guarda el día de cada ocurrencia en `datos.fecha`: si viene y es
 *  una fecha válida, dice de qué día habla el evento. */
function eventDay(event: AlertEvent): string | null {
  const day = event.data.fecha;
  return typeof day === "string" && isIsoDate(day) ? fechaCorta(day, true) : null;
}

export function AlertTimeline({ events }: { readonly events: readonly AlertEvent[] }) {
  return (
    <section className={styles.section} aria-labelledby="alerta-historial">
      <h3 id="alerta-historial" className={styles.label}>
        Historial <span>({ETIQUETA_ZONA})</span>
      </h3>
      {events.length === 0 ? (
        <p className={styles.empty}>El servicio no registró eventos para esta alerta.</p>
      ) : (
        <ol className={styles.timeline}>
          {events.map((event) => {
            const day = eventDay(event);
            return (
              <li key={event.id} className={styles.event}>
                <span className={styles.dot} data-event={event.type} aria-hidden="true">
                  {EVENT_ICON[event.type]}
                </span>
                <div>
                  <p className={styles.eventText}>
                    {EVENT_LABEL[event.type]}
                    {day ? `: ${day}` : ""}
                  </p>
                  {event.note ? <p className={styles.eventNote}>{event.note}</p> : null}
                  <p className={styles.eventMeta}>
                    {momentLabel(event.createdAt)} · {event.author}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

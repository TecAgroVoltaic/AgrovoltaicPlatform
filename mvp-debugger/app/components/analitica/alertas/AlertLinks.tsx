// A dónde seguir mirando: Calidad y Series con los enlaces que arma el backend
// (ya con el rango de la alerta), y el Asistente con ese mismo rango.
import Link from "next/link";

import { IconChat, IconDiagnose, IconTrend } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/analitica/alertas/drawer.module.css";
import { addDays } from "@/app/lib/analitica/dateRange";
import { rangeToQuery } from "@/app/lib/analitica/urlRange";
import type { Alert, AlertDetail } from "@/app/lib/alertas/contracts";

const ICON_SIZE = 14;
const ICON_STROKE = 2;
const ASSISTANT_PATH = "/asistente";

/** `fecha_fin` es inclusiva; el rango de la URL, exclusivo. Grano diario: una
 *  alerta se mide en días. */
function assistantHref(alert: Alert): string {
  return `${ASSISTANT_PATH}${rangeToQuery({
    from: alert.firstDate,
    toExclusive: addDays(alert.lastDate, 1),
    granularity: "day",
  })}`;
}

export type AlertLinksProps = {
  readonly alert: Alert;
  readonly links: AlertDetail["links"];
};

export function AlertLinks({ alert, links }: AlertLinksProps) {
  return (
    <nav className={styles.links} aria-label="Seguir mirando">
      <Link className={styles.link} href={links.quality}>
        <IconDiagnose size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        Ver en Calidad
      </Link>
      <Link className={styles.link} href={links.series}>
        <IconTrend size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        Ver en Series
      </Link>
      <Link className={styles.link} href={assistantHref(alert)}>
        <IconChat size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        Preguntar al asistente
      </Link>
    </nav>
  );
}

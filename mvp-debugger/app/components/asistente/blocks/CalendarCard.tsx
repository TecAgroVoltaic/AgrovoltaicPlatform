"use client";
// Los días con datos por fuente (`_calendario`, contrato §4.6): el calendario
// de actividad genérico dentro de una tarjeta, y debajo los huecos más largos.
import { useMemo } from "react";

import { IconCalendar } from "@/app/components/asistente/AssistantIcons";
import { CalendarGaps } from "@/app/components/asistente/blocks/CalendarGaps";
import { InvalidBlock } from "@/app/components/asistente/blocks/InvalidBlock";
import shared from "@/app/components/asistente/blocks/blockCard.module.css";
import { ActivityCalendar } from "@/app/components/charts";
import { rangeLabel } from "@/app/components/charts/activityCalendar/calendarGrid";
import { toActivityRows } from "@/app/lib/asistente/blocks/calendarRows";
import { parseCalendarioSpec } from "@/app/lib/asistente/contracts/calendarioSpec";

const ICON_SIZE = 16;
const DEFAULT_TITLE = "Días con datos";

export function CalendarCard({ spec }: { readonly spec: unknown }) {
  const parsed = useMemo(() => parseCalendarioSpec(spec), [spec]);
  const rows = useMemo(() => (parsed.ok ? toActivityRows(parsed.spec.filas) : []), [parsed]);
  if (!parsed.ok) return <InvalidBlock what="El calendario de actividad" reason={parsed.reason} />;

  const { titulo, desde, hasta, filas } = parsed.spec;
  const title = titulo || DEFAULT_TITLE;
  return (
    <section className={shared.card} aria-label={title}>
      <div className={shared.head}>
        <IconCalendar size={ICON_SIZE} />
        <p className={shared.title}>{title}</p>
        <p className={shared.headMeta}>{rangeLabel(desde, hasta)}</p>
      </div>
      {filas.length === 0 ? (
        <p className={shared.status}>No hay fuentes con datos en este rango.</p>
      ) : (
        <>
          <ActivityCalendar rows={rows} from={desde} to={hasta} />
          <CalendarGaps rows={filas} />
        </>
      )}
    </section>
  );
}

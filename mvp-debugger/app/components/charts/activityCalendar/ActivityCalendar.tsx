"use client";
// Calendario de actividad tipo GitHub, reutilizable: una fila por fuente, una
// celda por día. Si no cabe, se desplaza en horizontal dentro de su caja y
// arranca mostrando lo más reciente.
import { useEffect, useMemo, useRef } from "react";

import { ActivityCalendarRow } from "@/app/components/charts/activityCalendar/ActivityCalendarRow";
import styles from "@/app/components/charts/activityCalendar/activityCalendar.module.css";
import { buildWeeks, countRangeDays, monthLabels } from "@/app/components/charts/activityCalendar/calendarGrid";
import type { ActivityLevel, ActivityRow } from "@/app/components/charts/activityCalendar/types";

const LEGEND_LEVELS: readonly ActivityLevel[] = [0, 1, 2, 3, 4];

export type ActivityCalendarProps = {
  readonly rows: readonly ActivityRow[];
  /** Primer día, `YYYY-MM-DD`, inclusivo. */
  readonly from: string;
  /** Último día, `YYYY-MM-DD`, inclusivo. */
  readonly to: string;
};

export function ActivityCalendar({ rows, from, to }: ActivityCalendarProps) {
  const weeks = useMemo(() => buildWeeks(from, to), [from, to]);
  const months = useMemo(() => monthLabels(weeks), [weeks]);
  const totalDays = countRangeDays(weeks);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollLeft = box.scrollWidth;
  }, [weeks]);

  return (
    <div className={styles.calendar}>
      {/* Con foco, las flechas desplazan la caja: sin eso el teclado no llega a lo antiguo. */}
      <div ref={scrollRef} className={styles.scroll} tabIndex={0} role="group" aria-label="Calendario de actividad">
        <div className={styles.body}>
          <div className={styles.months} aria-hidden="true">
            <span className={styles.spacer} />
            <div className={styles.monthGrid}>
              {months.map((month) => (
                <span key={month.weekIndex} className={styles.month} style={{ gridColumn: month.weekIndex + 1 }}>
                  {month.label}
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <ActivityCalendarRow key={row.id} row={row} weeks={weeks} totalDays={totalDays} from={from} to={to} />
          ))}
        </div>
      </div>
      <div className={styles.legend}>
        <span className={styles.legendText}>Menos</span>
        {LEGEND_LEVELS.map((level) => (
          <span key={level} className={styles.cell} data-level={level} aria-hidden="true" />
        ))}
        <span className={styles.legendText}>Más</span>
      </div>
    </div>
  );
}

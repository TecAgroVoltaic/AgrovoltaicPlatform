// Una fila del calendario: punto, etiqueta y «N de M días», y debajo la rejilla
// de la fuente. La rejilla es una imagen para los lectores de pantalla: leen el
// resumen, no 600 celdas.
import styles from "@/app/components/charts/activityCalendar/activityCalendar.module.css";
import {
  cellTitle,
  countActiveDays,
  rowSummary,
  type CalendarWeek,
} from "@/app/components/charts/activityCalendar/calendarGrid";
import type { ActivityRow } from "@/app/components/charts/activityCalendar/types";

/** Solo lunes, miércoles y viernes llevan rótulo, como en GitHub. */
const WEEKDAY_LABELS = ["L", "", "X", "", "V", "", ""];

type ActivityCalendarRowProps = {
  readonly row: ActivityRow;
  readonly weeks: readonly CalendarWeek[];
  readonly totalDays: number;
  readonly from: string;
  readonly to: string;
};

export function ActivityCalendarRow({ row, weeks, totalDays, from, to }: ActivityCalendarRowProps) {
  const activeDays = countActiveDays(row, from, to);
  return (
    <div className={styles.row} data-tone={row.tone}>
      <p className={styles.rowHead}>
        <span className={styles.dot} aria-hidden="true" />
        <span>{row.label}</span>
        <span className={styles.rowCount}>
          {activeDays} de {totalDays} días
        </span>
      </p>
      <div className={styles.rowGrid}>
        <div className={styles.weekdays} aria-hidden="true">
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div className={styles.cells} role="img" aria-label={rowSummary(row, activeDays, totalDays, from, to)}>
          {weeks.flatMap((week, weekIndex) =>
            week.map((date, dayIndex) => {
              const key = `${weekIndex}-${dayIndex}`;
              if (date === null) return <span key={key} className={`${styles.cell} ${styles.outside}`} />;
              const day = row.days.get(date);
              return <span key={key} className={styles.cell} data-level={day?.level ?? 0} title={cellTitle(date, day)} />;
            }),
          )}
        </div>
      </div>
    </div>
  );
}

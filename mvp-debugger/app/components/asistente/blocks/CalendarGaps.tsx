// Los huecos más largos de cada fuente, debajo del calendario: una lista
// compacta «27 jun – 3 set 2025 · 69 días». Sin huecos, una sola línea.
import styles from "@/app/components/asistente/blocks/calendar.module.css";
import { rangeLabel } from "@/app/components/charts/activityCalendar/calendarGrid";
import { SourceDot } from "@/app/components/fuentes/SourceDot";
import type { CalendarioRow } from "@/app/lib/asistente/contracts/calendarioSpec";

/** El umbral lo fija el backend (contrato §4.6); acá solo se nombra. */
const MIN_GAP_DAYS = 3;

export function CalendarGaps({ rows }: { readonly rows: readonly CalendarioRow[] }) {
  const gaps = rows.flatMap((row, rowIndex) =>
    row.huecos.map((gap) => ({ key: `${rowIndex}-${gap.desde}`, source: row.fuente, label: row.etiqueta, gap })),
  );
  if (gaps.length === 0) return <p className={styles.noGaps}>Sin huecos de {MIN_GAP_DAYS} días o más</p>;

  return (
    <ul className={styles.gaps} aria-label="Huecos más largos">
      {gaps.map(({ key, source, label, gap }) => (
        <li key={key} className={styles.gap}>
          <SourceDot source={source} />
          <span className={styles.gapSource}>{label}</span>
          <span className={styles.gapRange}>
            {rangeLabel(gap.desde, gap.hasta)} · {gap.dias} {gap.dias === 1 ? "día" : "días"}
          </span>
        </li>
      ))}
    </ul>
  );
}

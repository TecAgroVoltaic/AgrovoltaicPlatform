// Los días afectados como tiras de calendario por mes (ver `affectedDays.ts`).
// La tira es visual; el lector de pantalla recibe la misma información en una
// frase, en vez de treinta celdas leídas de a una.
import { affectedDays, MAX_MONTH_STRIPS } from "@/app/components/analitica/alertas/affectedDays";
import styles from "@/app/components/analitica/alertas/drawer.module.css";
import type { Alert } from "@/app/lib/alertas/contracts";
import type { AlertSeverity } from "@/app/lib/alertas/vocabulary";

const DAY_OF_MONTH_DIGITS = 2;

function dayNumber(date: string): number {
  return Number(date.slice(-DAY_OF_MONTH_DIGITS));
}

export type AffectedDaysStripProps = {
  readonly dates: Alert["evidence"]["dates"];
  readonly severity: AlertSeverity;
};

export function AffectedDaysStrip({ dates, severity }: AffectedDaysStripProps) {
  const { strips, hiddenMonths } = affectedDays(dates);
  if (strips.length === 0) return null;
  return (
    <>
      {strips.map((strip) => (
        <section key={strip.month} className={styles.section} aria-label={`Días afectados · ${strip.label}`}>
          <h3 className={styles.label} aria-hidden="true">
            Días afectados · {strip.label}
          </h3>
          <p className={styles.srOnly}>
            Con la condición: {strip.affectedDates.map(dayNumber).join(", ")} de {strip.label}.
          </p>
          <ol className={styles.strip} aria-hidden="true">
            {strip.days.map((day) => (
              <li key={day.date} className={styles.day} data-affected={day.affected} data-severity={severity}>
                {dayNumber(day.date)}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {hiddenMonths > 0 ? (
        <p className={styles.empty}>
          Se muestran los {MAX_MONTH_STRIPS} meses más recientes; hay {hiddenMonths} más con días afectados.
        </p>
      ) : null}
    </>
  );
}

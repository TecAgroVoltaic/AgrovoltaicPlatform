// Las fuentes que vinieron INCOMPLETAS: qué cajas no respondieron y por qué. Una
// fila incompleta no muestra huecos, porque un día sin datos podría ser solo la
// caja que no contestó; esta lista lo dice en vez de esconderlo.
import styles from "@/app/components/asistente/blocks/calendar.module.css";
import { SourceDot } from "@/app/components/fuentes/SourceDot";
import type { CalendarioRow } from "@/app/lib/asistente/contracts/calendarioSpec";

export function CalendarFailures({ rows }: { readonly rows: readonly CalendarioRow[] }) {
  const incomplete = rows.filter((row) => !row.completa);
  if (incomplete.length === 0) return null;

  return (
    <ul className={styles.failures} aria-label="Fuentes incompletas">
      {incomplete.map((row) => (
        <li key={row.fuente + row.etiqueta} className={styles.failure}>
          <span className={styles.failureMark} aria-hidden="true">!</span>
          <SourceDot source={row.fuente} />
          <span>
            {row.etiqueta}: incompleta, {row.fallas.length}{" "}
            {row.fallas.length === 1 ? "caja no respondió" : "cajas no respondieron"}
          </span>
          <span className={styles.failureReason} title={row.fallas.map((f) => `${f.caja}: ${f.motivo}`).join("\n")}>
            {row.fallas[0]?.motivo}
          </span>
        </li>
      ))}
    </ul>
  );
}

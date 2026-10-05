"use client";
// Los días que NO entraron en el PR, con el motivo de cada uno.
//
// El criterio que de verdad filtra no es la cobertura de cada serie por separado
// sino el desfase entre las dos: si el piranómetro grabó doce horas y el inversor
// seis, el PR sale a la mitad sin que ninguna de las dos coberturas se vea mal.
// Por eso la columna del desfase va al lado de las otras dos.
import type {
  DiscardedDay,
  ValidDayCriterion,
} from "@/app/lib/analitica/contracts/comparativa";
import { formatDecimal, formatFraction } from "@/app/components/analitica/comparativa/format";
import { describeDiscardReason } from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const REASON_SEPARATOR = ", ";
const SCROLL_LABEL = "Días descartados del cálculo, tabla desplazable";

export type DiscardedDaysTableProps = {
  readonly days: readonly DiscardedDay[];
  readonly criterion: ValidDayCriterion;
};

export function DiscardedDaysTable({ days, criterion }: DiscardedDaysTableProps) {
  if (days.length === 0) return null;
  return (
    // Cinco columnas donde el motivo es prosa y las otras cuatro son cifras que
    // se comparan entre sí (dos coberturas contra un desfase). Se desplaza de
    // lado por lo mismo que la matriz de variantes; y de largo ya se desplazaba,
    // porque son 228 días.
    <div
      className={`${styles.scrollBox} ${styles.tablaAncha}`}
      role="region"
      aria-label={SCROLL_LABEL}
      tabIndex={0}
    >
      <table className="tbl">
        <caption className="muted small">
          Se descarta el día que no llega al {formatFraction(criterion.minCoverage)} de
          cobertura o que separa radiación y eléctrico más de{" "}
          {formatDecimal(criterion.maxOffsetHours)} h. {criterion.explanation}
        </caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Motivo</th>
            <th scope="col">Cobertura radiación</th>
            <th scope="col">Cobertura eléctrico</th>
            <th scope="col">Desfase (h)</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.day}>
              <th scope="row" className="mono">
                {day.day}
              </th>
              <td>{day.reasons.map(describeDiscardReason).join(REASON_SEPARATOR)}</td>
              <td className="mono">{describeCoverage(day.radiationCoverage)}</td>
              <td className="mono">{describeCoverage(day.electricalCoverage)}</td>
              <td className="mono">{formatDecimal(day.offsetHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function describeCoverage(coverage: number | null): string {
  return coverage === null ? "sin dato" : formatFraction(coverage);
}

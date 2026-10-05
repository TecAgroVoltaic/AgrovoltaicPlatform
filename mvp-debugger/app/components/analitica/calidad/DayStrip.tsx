// Una tira de días: una celda por día de CALENDARIO, en orden.
//
// Las celdas no son focalizables a propósito. Con el histórico completo son 660
// paradas de tabulador por tira, y quien navega con teclado tendría que cruzar
// más de mil antes de llegar a la tabla. No es una renuncia de accesibilidad: lo
// que hace que un lector de pantalla anuncie la celda es su `aria-label`, no el
// foco, así que en modo lectura se recorre día por día igual, sin convertir la
// tira en una trampa de tabulador. La elección de un día se hace en el selector
// accesible del explorador de hallazgos.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import type { StateBadge } from "@/app/components/analitica/calidad/labels";

export type DayCell = {
  readonly date: string;
  readonly badge: StateBadge;
  /** Lo que se lee al posarse encima y lo que anuncia el lector de pantalla. */
  readonly description: string;
};

export type DayStripProps = {
  readonly title: string;
  readonly cells: readonly DayCell[];
  /** Los estados que esta tira puede mostrar, para su leyenda. */
  readonly legend: readonly StateBadge[];
};

export function DayStrip({ title, cells, legend }: DayStripProps) {
  return (
    <div>
      <h3 className="lbl">{title}</h3>
      <ul className={styles.strip} aria-label={title}>
        {cells.map((cell) => (
          <li
            key={cell.date}
            className={cell.badge.patternClass}
            title={cell.description}
            aria-label={cell.description}
          />
        ))}
      </ul>
      <ul className={styles.legend}>
        {legend.map((badge) => (
          <li key={badge.label} className={styles.legendItem}>
            <span className={badge.patternClass} aria-hidden="true" />
            <span aria-hidden="true">{badge.glyph}</span>
            <span>
              {badge.label}: {badge.meaning}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

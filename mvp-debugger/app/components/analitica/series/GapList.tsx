// Los tramos del calendario sin una sola fila, escritos con todas las letras.
//
// El gráfico ya los muestra (barra de lo esperado sin nada al lado, línea de la
// serie cortada), pero un hueco de 126 días entre 569 se lee mal a ojo: mide dos
// centímetros de eje. Escribir «del 2025-01-01 al 2025-04-30, 120 días» es lo que
// convierte una zona en blanco en un hallazgo. Los tramos los cuenta el backend.
import styles from "@/app/components/analitica/series/series.module.css";
import type { DataGap } from "@/app/lib/analitica/contracts/series";

const MAX_GAPS_SHOWN = 6;

export type GapListProps = {
  readonly gaps: readonly DataGap[];
  /** Nombre de la fuente, para que el lector de pantalla sepa de cuál habla. */
  readonly sourceLabel: string;
};

export function GapList({ gaps, sourceLabel }: GapListProps) {
  if (gaps.length === 0) return null;
  const shown = gaps.slice(0, MAX_GAPS_SHOWN);
  const hidden = gaps.length - shown.length;
  return (
    <>
      <p className="muted small">
        {gaps.length === 1 ? "1 tramo sin ninguna fila:" : `${gaps.length} tramos sin ninguna fila:`}
      </p>
      <ul className={styles.gaps} aria-label={`Tramos sin datos de ${sourceLabel}`}>
        {shown.map((gap) => (
          <li className="pill" key={`${gap.from}-${gap.to}`}>
            del {gap.from} al {gap.to} · {gap.days} {gap.days === 1 ? "día" : "días"}
          </li>
        ))}
        {hidden > 0 ? <li className="pill muted">y {hidden} más</li> : null}
      </ul>
    </>
  );
}

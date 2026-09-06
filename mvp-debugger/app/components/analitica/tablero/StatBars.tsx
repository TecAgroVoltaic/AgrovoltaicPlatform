// Tres conteos contra el mismo total, dibujados en vez de contados en prosa.
//
// Sustituye a los párrafos que decían «de 274 días de calendario, 228 traen
// alguna fila y 48 pasan las pruebas»: la caída de 274 a 48 se ve de un vistazo
// y se lee en un segundo, que es lo que la frase tardaba tres líneas en decir.
//
// La barra es GEOMETRÍA, no una cuenta: los números que se leen son los que
// mandó el backend, y ninguno se deriva de otro. Lo único que se calcula es el
// ancho en píxeles, igual que hace cualquier gráfico de barras.
import { formatInteger } from "@/app/components/analitica/tablero/format";
import styles from "@/app/components/analitica/tablero/tablero.module.css";

const FULL_WIDTH_PERCENT = 100;

export type StatBar = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** `warn` para lo que hay que mirar (días parados, días perdidos). */
  readonly tone?: "warn";
};

export type StatBarsProps = {
  /** El 100% de la escala. Llega del backend como los demás conteos. */
  readonly total: number;
  readonly bars: readonly StatBar[];
  /** Unidad de los conteos, para que la lista se lea sola en voz alta. */
  readonly unit: string;
};

export function StatBars({ total, bars, unit }: StatBarsProps) {
  return (
    <ul className={styles.statBars}>
      {bars.map((bar) => (
        <li className={styles.statBar} key={bar.id}>
          <span className={styles.statLabel}>{bar.label}</span>
          <span className={styles.statTrack} aria-hidden="true">
            <span
              className={bar.tone === "warn" ? styles.statFillWarn : styles.statFill}
              style={{ width: widthOf(bar.value, total) }}
            />
          </span>
          <span className={styles.statValue}>
            {formatInteger(bar.value)} de {formatInteger(total)} {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Un total en cero deja la barra vacía en vez de dividir por cero. */
function widthOf(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${(value / total) * FULL_WIDTH_PERCENT}%`;
}

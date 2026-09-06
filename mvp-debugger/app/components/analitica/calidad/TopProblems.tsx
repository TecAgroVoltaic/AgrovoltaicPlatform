// La respuesta a "¿hay algo grave?", que es lo segundo que se pregunta quien
// entra acá.
//
// Es el ranking que el servicio ya trae ordenado por días afectados: llega hecho
// y se pinta en su orden. Existe para que la tabla de 133 filas por tipo pueda
// irse a una pestaña sin que la pantalla pierda la alarma.
//
// La barra dice cuánto del período toca cada problema, que en prosa costaba una
// línea por fila. Es GEOMETRÍA: los dos números que se leen son los que mandó el
// backend y ninguno se deriva del otro; lo único que se calcula es el ancho, que
// es lo que hace cualquier gráfico de barras.
//
// La explicación de cada tipo NO va acá: la escribe el glosario del servicio y
// se lee en "Qué está roto", que es donde se va a mirar de cerca.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { SeverityTag } from "@/app/components/analitica/calidad/SeverityTag";
import { formatCount, pluralizeDays } from "@/app/components/analitica/calidad/format";
import type { TopProblem } from "@/app/lib/analitica/contracts/calidad";

const TITLE = "Lo que más días toca";
const NOTHING_RANKED =
  "El servicio no señaló ningún problema recurrente en el período: mirá «Qué está roto» antes de darlo por limpio.";
const FULL_WIDTH_PERCENT = 100;
const EMPTY_WIDTH = "0%";

export type TopProblemsProps = {
  readonly problems: readonly TopProblem[];
  /** El 100 % de la barra. Llega del backend como los demás conteos. */
  readonly daysWithData: number;
};

export function TopProblems({ problems, daysWithData }: TopProblemsProps) {
  return (
    <section className={`card ${styles.aside}`} aria-labelledby="mas-frecuentes">
      <h2 className="kpi-title" id="mas-frecuentes">
        {TITLE}
      </h2>
      {problems.length === 0 ? (
        <p className="muted small">{NOTHING_RANKED}</p>
      ) : (
        <ol className={styles.ranking}>
          {problems.map((problem) => (
            <li key={problem.type} className={styles.rankingRow}>
              <span className={styles.rankingHead}>
                <SeverityTag severity={problem.severity} />
                <span className="mono">{problem.type}</span>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.fill} style={{ width: widthOf(problem.days, daysWithData) }} />
              </span>
              <span className={styles.rankingFigures}>
                <b className="mono">
                  {formatCount(problem.days)} de {formatCount(daysWithData)}{" "}
                  {pluralizeDays(daysWithData)}
                </b>
                <span className="muted small">
                  {formatCount(problem.variables)} variables · {describeReadings(problem.readings)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Un período sin días con datos deja la barra vacía en vez de dividir por cero. */
function widthOf(days: number, daysWithData: number): string {
  if (daysWithData <= 0) return EMPTY_WIDTH;
  return `${(days / daysWithData) * FULL_WIDTH_PERCENT}%`;
}

/** No todos los detectores cuentan lecturas. Un 0 ahí se leería como "no tocó
 * ninguna", que es lo contrario de "nadie las contó". */
function describeReadings(readings: number | null): string {
  return readings === null ? "sin conteo de lecturas" : `${formatCount(readings)} lecturas`;
}

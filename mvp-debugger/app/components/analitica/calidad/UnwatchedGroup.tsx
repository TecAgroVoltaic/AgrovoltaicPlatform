// Un grupo de variables fuera de vigilancia, ordenado por cuántos hallazgos
// acumula. Se ordena, no se suma: el total de "hallazgos que no pesan" no lo
// publica ningún endpoint, y calcularlo acá lo haría discrepar del agente el día
// que el backend cambie qué cuenta. Cada cifra sale del payload tal cual, con el
// total del período al lado para que la escala se vea sin aritmética.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { formatCount } from "@/app/components/analitica/calidad/format";
import type { UnwatchedVariable } from "@/app/lib/analitica/contracts/calidad";

export type UnwatchedGroupProps = {
  readonly title: string;
  readonly variables: readonly UnwatchedVariable[];
  readonly findingsInPeriod: number;
};

export function UnwatchedGroup({ title, variables, findingsInPeriod }: UnwatchedGroupProps) {
  if (variables.length === 0) return null;
  const ranked = [...variables].sort((one, other) => other.findingsInPeriod - one.findingsInPeriod);

  return (
    <>
      <h3 className="lbl">{title}</h3>
      <ul className={styles.findings}>
        {ranked.map((variable) => (
          <li key={variable.key} className={styles.unwatched}>
            <span className="mono">{variable.key}</span>
            <span className="pill mono">{variable.reason}</span>
            <span className="muted small">
              familia {variable.family} · fuente {variable.source ?? "ninguna"}
            </span>
            <b className="mono">
              {formatCount(variable.findingsInPeriod)} de {formatCount(findingsInPeriod)} hallazgos
            </b>
            <span className={variable.countsForVerdict ? "sev-aviso" : "sev-grave"}>
              {variable.countsForVerdict ? "△ sí pesa" : "✕ no pesa nunca"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

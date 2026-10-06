// La evidencia de una alerta, tal como la guarda el backend: cifras a la vista,
// y las fechas y los hallazgos de origen plegados (pueden ser decenas).
//
// Las cifras se muestran sin interpretar: su forma depende de la regla que
// disparó la alerta, y adivinarles unidad o significado sería inventar.
import Link from "next/link";

import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { Disclosure } from "@/app/components/analitica/Disclosure";
import type { Alert, AlertDetail } from "@/app/lib/alertas/contracts";

const NUMBER_FORMAT = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 });
const MISSING = "—";

function formatFigure(value: unknown): string {
  if (value === null || value === undefined) return MISSING;
  if (typeof value === "number") return NUMBER_FORMAT.format(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export type AlertEvidenceProps = {
  readonly evidence: Alert["evidence"];
  readonly links: AlertDetail["links"];
};

export function AlertEvidence({ evidence, links }: AlertEvidenceProps) {
  const figures = Object.entries(evidence.figures);
  return (
    <section className={styles.block} aria-labelledby="alerta-evidencia">
      <h3 id="alerta-evidencia" className="lbl">
        Evidencia
      </h3>
      {figures.length > 0 ? (
        <dl className={styles.figures}>
          {figures.map(([name, value]) => (
            <div key={name} className={styles.figure}>
              <dt className="mono small muted">{name}</dt>
              <dd className="mono">{formatFigure(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted small">El servicio no adjuntó cifras a esta alerta.</p>
      )}
      {evidence.dates.length > 0 ? (
        <Disclosure label="¿Qué días se vio?">
          <p className={`mono ${styles.dates}`}>{evidence.dates.join(" · ")}</p>
        </Disclosure>
      ) : null}
      {evidence.findings.length > 0 ? (
        <Disclosure label="¿De qué hallazgos sale?">
          <ul className={styles.findings}>
            {evidence.findings.map((finding) => (
              <li key={`${finding.date}:${finding.source}:${finding.variable}:${finding.type}`} className="mono">
                {finding.date} · {finding.source} · {finding.variable} · {finding.type}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      <p className={styles.links}>
        <Link href={links.quality}>Ver en Calidad</Link>
        <Link href={links.series}>Ver en Series</Link>
      </p>
    </section>
  );
}

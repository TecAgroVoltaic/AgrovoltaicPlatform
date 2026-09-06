// La lista de hallazgos ya traída. Presenta, no decide ni pide nada.
//
// Cada fila lleva la frase del servicio (`que_es`) y, cuando el detalle trae una
// nota redactada, también esa: son las que explican por qué un hallazgo grave
// puede no ser un problema del dato (el inversor sin acoplar, por ejemplo).
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { FindingsPager } from "@/app/components/analitica/calidad/FindingsPager";
import { SeverityTag } from "@/app/components/analitica/calidad/SeverityTag";
import { formatCount } from "@/app/components/analitica/calidad/format";
import { readText } from "@/app/components/analitica/calidad/detail";
import type { Finding, FindingsPage } from "@/app/lib/analitica/contracts/calidad";

const DETAIL_NOTE_KEY = "nota";

export type FindingsListProps = {
  readonly page: FindingsPage;
  readonly onGoTo: (offset: number) => void;
};

export function FindingsList({ page, onGoTo }: FindingsListProps) {
  return (
    <>
      <FindingsPager page={page} onGoTo={onGoTo} />
      <ul className={styles.findings}>
        {page.findings.map((finding, position) => (
          <li key={rowKey(finding, position)} className={styles.finding}>
            <SeverityTag severity={finding.severity} />
            <span className="mono">{finding.date}</span>
            <span className="mono">{finding.variable ?? "sin variable"}</span>
            <span className="mono small muted">{finding.type}</span>
            <span>{finding.whatItIs}</span>
            <span className="muted small">
              {formatCount(finding.affected)} lecturas · {finding.source}
            </span>
            {readNote(finding) ? <span className="muted small">{readNote(finding)}</span> : null}
          </li>
        ))}
      </ul>
      <FindingsPager page={page} onGoTo={onGoTo} />
    </>
  );
}

/** Un mismo día puede repetir tipo y variable entre fuentes: la posición desempata. */
function rowKey(finding: Finding, position: number): string {
  return `${finding.date}-${finding.source}-${finding.variable}-${finding.type}-${position}`;
}

function readNote(finding: Finding): string | null {
  return readText(finding.detail, DETAIL_NOTE_KEY);
}

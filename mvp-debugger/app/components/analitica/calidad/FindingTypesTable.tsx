// Qué está roto, por tipo, con la jerarquía puesta en la estructura.
//
// Sobre el histórico completo son 133 filas repartidas en 5.140 graves, 10.620
// avisos y 12.749 informativos: pintarlo todo con la misma alarma no informa de
// nada. Los graves vienen abiertos, el resto se abre al profundizar, y qué
// significa cada gravedad se lee en el propio grupo en vez de en una leyenda
// aparte que hay que ir a buscar.
//
// La explicación de cada tipo es la del servicio (`QUE_ES`), nunca una escrita
// acá, y llega en su propia lectura: el glosario son 32 KB que solo sirven en
// esta pestaña. Si esa lectura falla, la tabla se pinta igual y admite el hueco;
// sus conteos no dependen del glosario.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { SectionState } from "@/app/components/analitica/calidad/SectionState";
import { SeverityTag } from "@/app/components/analitica/calidad/SeverityTag";
import { SEVERITY_BADGE } from "@/app/components/analitica/calidad/labels";
import { formatCount } from "@/app/components/analitica/calidad/format";
import type { ChartState } from "@/app/components/charts";
import {
  SEVERITY_ORDER,
  type FindingGlossary,
  type FindingTypeRow,
  type Severity,
} from "@/app/lib/analitica/contracts/calidad";

const WHAT = "el glosario de tipos del servicio";
const MISSING_EXPLANATION = "el servicio no publicó una explicación para este tipo";
const NO_GLOSSARY: FindingGlossary = new Map();
const SCROLL_LABEL = "Tabla de hallazgos por tipo, desplazable";

export type FindingTypesTableProps = {
  readonly types: readonly FindingTypeRow[];
  readonly glossaryState: ChartState<FindingGlossary>;
  /** Lleva el tipo elegido al explorador de hallazgos. */
  readonly onSelectType: (type: string) => void;
};

export function FindingTypesTable({ types, glossaryState, onSelectType }: FindingTypesTableProps) {
  const glossary = glossaryState.status === "ready" ? glossaryState.data : NO_GLOSSARY;

  return (
    <section className="card" aria-labelledby="por-tipo">
      <h2 className="kpi-title" id="por-tipo">
        Problemas por tipo, de lo grave a lo anotado
      </h2>
      <SectionState what={WHAT} state={glossaryState} />
      {glossaryState.status === "loading"
        ? null
        : SEVERITY_ORDER.map((severity) => (
            <SeverityGroup
              key={severity}
              severity={severity}
              rows={rowsOf(types, severity)}
              glossary={glossary}
              onSelectType={onSelectType}
            />
          ))}
    </section>
  );
}

/** Ordenar por días afectados es dar forma, no recalcular: el número ya vino. */
function rowsOf(types: readonly FindingTypeRow[], severity: Severity): FindingTypeRow[] {
  return types.filter((row) => row.severity === severity).sort((one, other) => other.days - one.days);
}

type SeverityGroupProps = {
  readonly severity: Severity;
  readonly rows: readonly FindingTypeRow[];
  readonly glossary: FindingGlossary;
  readonly onSelectType: (type: string) => void;
};

function SeverityGroup({ severity, rows, glossary, onSelectType }: SeverityGroupProps) {
  if (rows.length === 0) return null;
  return (
    <details className={styles.typeGroup} open={severity === "critical"}>
      <summary className={styles.typeGroupSummary}>
        <SeverityTag severity={severity} withMeaning />{" "}
        <span className="muted small">{formatCount(rows.length)} filas</span>
      </summary>
      {/* Ocho columnas y una de ellas es prosa del glosario: es la tabla más ancha
          de la consola (941 px medidos) y no hay ancho de teléfono donde entre.
          Se desplaza de lado en vez de replegarse a fichas porque acá se compara
          ENTRE filas (qué tipo toca más días, cuál dura más), y eso solo se lee
          con las cifras alineadas en columna. La caja avisa con una sombra de que
          queda tabla a la derecha y se puede mover con el teclado. */}
      <div
        className={`tbl-scroll ${styles.tablaAncha}`}
        role="region"
        aria-label={`${SCROLL_LABEL}: ${SEVERITY_BADGE[severity].label}`}
        tabIndex={0}
      >
        <table className="tbl">
          <caption className={styles.srOnly}>
            Hallazgos de gravedad {SEVERITY_BADGE[severity].label}
          </caption>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col" className={styles.queEs}>
                Qué es
              </th>
              <th scope="col">Fuente</th>
              <th scope="col">Días</th>
              <th scope="col">Variables</th>
              <th scope="col">Lecturas</th>
              <th scope="col">Desde / hasta</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.source}-${row.type}`}>
                <th scope="row" className="mono">
                  {row.type}
                </th>
                <td className={styles.queEs}>
                  {glossary.get(row.type) ?? MISSING_EXPLANATION}
                </td>
                <td className="mono small">{row.source}</td>
                <td className="mono">{formatCount(row.days)}</td>
                <td className="mono">{formatCount(row.variables)}</td>
                <td className="mono">{formatCount(row.readings)}</td>
                <td className="mono small">
                  {row.firstDay ?? "sin dato"} → {row.lastDay ?? "sin dato"}
                </td>
                <td>
                  <button className="btn-sm" type="button" onClick={() => onSelectType(row.type)}>
                    Ver hallazgos de {row.type}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

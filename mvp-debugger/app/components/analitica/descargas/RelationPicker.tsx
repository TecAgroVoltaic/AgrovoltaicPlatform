"use client";
// Paso 1: qué tabla se baja.
//
// Es una lista de radios y no una tabla de nueve filas por el teléfono: una
// tabla con descripción, filas y cobertura no cabe en 360 px sin desplazamiento
// lateral, y partirla en tarjetas no pierde nada porque cada opción se lee sola.
//
// La marca «fuera del rango» va acá y no solo en el resumen final para que la
// advertencia llegue ANTES de elegir, que es cuando todavía sirve de algo.
import { formatCount, formatRows } from "@/app/components/analitica/descargas/format";
import { relationScope, relationWindowLabel } from "@/app/components/analitica/descargas/scope";
import styles from "@/app/components/analitica/descargas/vista.module.css";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

export type RelationPickerProps = {
  readonly relations: readonly ExportRelation[];
  readonly selectedKey: string;
  readonly range: DateRange;
  readonly onSelect: (key: string) => void;
};

const LEGEND = "1. Qué tabla";
const RADIO_GROUP_NAME = "relacion";
const OUT_OF_RANGE_TAG = "fuera del rango";

export function RelationPicker({ relations, selectedKey, range, onSelect }: RelationPickerProps) {
  return (
    <fieldset className={`card ${styles.grupo}`}>
      <legend className={styles.leyenda}>{LEGEND}</legend>
      <div className={styles.tablas}>
        {relations.map((relation) => (
          <label
            key={relation.key}
            className={relation.key === selectedKey ? `${styles.opcion} ${styles.opcionOn}` : styles.opcion}
          >
            <input
              type="radio"
              name={RADIO_GROUP_NAME}
              value={relation.key}
              checked={relation.key === selectedKey}
              onChange={() => onSelect(relation.key)}
            />
            <span className={styles.opcionCuerpo}>
              <span className={styles.opcionTitulo}>
                {relation.label}
                {relationScope(relation, range).kind === "outside" ? (
                  <span className="tag warn">{OUT_OF_RANGE_TAG}</span>
                ) : null}
              </span>
              <span className="muted small">{relation.description}</span>
              <span className={`mono ${styles.opcionDatos}`}>
                {formatRows(relation.rows)} · {relationWindowLabel(relation)} ·{" "}
                {formatCount(relation.columns.length)} col.
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

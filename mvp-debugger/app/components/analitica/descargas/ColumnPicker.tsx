"use client";
// Paso 2: qué columnas lleva el archivo.
//
// Manda el NOMBRE de la columna y no su etiqueta: el nombre es lo que va a
// aparecer en la cabecera del archivo, así que es por lo que la persona la va a
// reconocer después. La etiqueta queda debajo, en gris.
import { formatCount } from "@/app/components/analitica/descargas/format";
import styles from "@/app/components/analitica/descargas/vista.module.css";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

export type ColumnPickerProps = {
  readonly relation: ExportRelation;
  readonly selected: readonly string[];
  readonly onToggle: (name: string) => void;
  readonly onSelectAll: () => void;
  readonly onClear: () => void;
};

const LEGEND = "2. Qué columnas";
const DEFAULTS_NOTE =
  "Las columnas de contabilidad interna del ETL (identificadores y sellos de carga) vienen destildadas.";
const TIME_MARK = "columna de tiempo";

export function ColumnPicker({
  relation,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: ColumnPickerProps) {
  const chosen = new Set(selected);
  return (
    <fieldset className={`card ${styles.grupo}`}>
      <legend className={styles.leyenda}>{LEGEND}</legend>
      <p className="muted small">{DEFAULTS_NOTE}</p>
      <div className={styles.barra}>
        <span className="mono muted small">
          {formatCount(chosen.size)} de {formatCount(relation.columns.length)} elegidas
        </span>
        <div className="chips">
          <button type="button" className="chip" onClick={onSelectAll}>
            Todas
          </button>
          <button type="button" className="chip" onClick={onClear}>
            Ninguna
          </button>
        </div>
      </div>
      <div className={styles.columnas}>
        {relation.columns.map((column) => (
          <label key={column.name} className={styles.columna}>
            <input
              type="checkbox"
              checked={chosen.has(column.name)}
              onChange={() => onToggle(column.name)}
            />
            <span className={styles.columnaCuerpo}>
              <span className="mono">{column.name}</span>
              <span className="muted small">
                {column.label}
                {column.unit ? ` (${column.unit})` : ""}
                {column.name === relation.timeColumn ? ` · ${TIME_MARK}` : ""}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

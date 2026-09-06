"use client";
// El único mapa que va a tener un `.dat` numérico.
//
// Ese archivo es una matriz de números sin cabecera: quien lo abra no puede
// saber que la columna 3 es la corriente. Acá se muestra el orden exacto, con su
// número de posición, para que se pueda copiar o anotar ANTES de bajarlo. Es
// información que el archivo no va a dar y que después ya no se puede recuperar.
import styles from "@/app/components/analitica/descargas/vista.module.css";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

export type NumericDatNoticeProps = {
  readonly relation: ExportRelation;
  readonly columns: readonly string[];
};

const TITLE = "Orden exacto de las columnas del archivo";
const HINT = "El archivo no lo trae: copialo o anotalo antes de descargar.";
const DATENUM_MARK = "datenum";

export function NumericDatNotice({ relation, columns }: NumericDatNoticeProps) {
  if (columns.length === 0) return null;
  const timeColumn = relation.timeColumn;
  const carriesTime = timeColumn !== null && columns.includes(timeColumn);
  return (
    <div className={styles.orden}>
      <p className={styles.leyenda}>{TITLE}</p>
      <ol className={styles.ordenLista}>
        {columns.map((name) => (
          <li key={name} className="mono">
            {name}
            {name === timeColumn ? ` · ${DATENUM_MARK}` : ""}
          </li>
        ))}
      </ol>
      <p className="muted small">{HINT}</p>
      {carriesTime ? (
        <p className="muted small">
          «{timeColumn}» viaja como {DATENUM_MARK} de MATLAB (días desde el año 0), no como fecha
          legible.
        </p>
      ) : null}
    </div>
  );
}

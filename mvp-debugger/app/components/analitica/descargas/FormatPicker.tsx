"use client";
// Paso 3: en qué formato.
//
// La casilla de MATLAB no es un detalle de configuración: cambia el archivo de
// forma irreversible (pierde los nombres de columna) y prohíbe los metadatos. Lo
// que eso implica se dice AQUÍ, donde se marca, y no en una nota al pie que ya
// se leería con el archivo bajado.
import { FORMAT_OPTIONS, type DownloadFormat } from "@/app/components/analitica/descargas/download";
import { NumericDatNotice } from "@/app/components/analitica/descargas/NumericDatNotice";
import styles from "@/app/components/analitica/descargas/vista.module.css";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

export type FormatPickerProps = {
  readonly relation: ExportRelation;
  /** Los nombres elegidos, en el orden en que van a salir en el archivo. */
  readonly columns: readonly string[];
  readonly format: DownloadFormat;
  readonly matlabNumeric: boolean;
  readonly metadata: boolean;
  readonly metadataEnabled: boolean;
  readonly onFormat: (format: DownloadFormat) => void;
  readonly onMatlabNumeric: (on: boolean) => void;
  readonly onMetadata: (on: boolean) => void;
};

const LEGEND = "3. En qué formato";
const RADIO_GROUP_NAME = "formato";
const MATLAB_LABEL = "Compatible con load() de MATLAB";
const MATLAB_WARNING =
  "El archivo queda solo con números y PIERDE los nombres de columna: load() no admite cabecera.";
const METADATA_LABEL = "Incluir metadatos (unidades y notas en la cabecera)";
const METADATA_BLOCKED =
  "No se pueden incluir con la variante numérica: cualquier línea que no sea un número rompe load().";

export function FormatPicker(props: FormatPickerProps) {
  const { relation, columns, format, matlabNumeric, metadata, metadataEnabled } = props;
  return (
    <fieldset className={`card ${styles.grupo}`}>
      <legend className={styles.leyenda}>{LEGEND}</legend>

      <div className={styles.formatos}>
        {FORMAT_OPTIONS.map((option) => (
          <label
            key={option.format}
            className={option.format === format ? `${styles.opcion} ${styles.opcionOn}` : styles.opcion}
          >
            <input
              type="radio"
              name={RADIO_GROUP_NAME}
              value={option.format}
              checked={option.format === format}
              onChange={() => props.onFormat(option.format)}
            />
            <span className={styles.opcionCuerpo}>
              <span className={`mono ${styles.opcionTitulo}`}>{option.label}</span>
              <span className="muted small">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {format === "dat" ? (
        <div className={styles.variante}>
          <label className={styles.casilla}>
            <input
              type="checkbox"
              checked={matlabNumeric}
              onChange={(event) => props.onMatlabNumeric(event.target.checked)}
            />
            <span>
              <span>{MATLAB_LABEL}</span>
              <span className={styles.aviso}>{MATLAB_WARNING}</span>
            </span>
          </label>
          {matlabNumeric ? <NumericDatNotice relation={relation} columns={columns} /> : null}
        </div>
      ) : null}

      <label className={metadataEnabled ? styles.casilla : `${styles.casilla} ${styles.casillaOff}`}>
        <input
          type="checkbox"
          checked={metadata && metadataEnabled}
          disabled={!metadataEnabled}
          onChange={(event) => props.onMetadata(event.target.checked)}
        />
        <span>
          <span>{METADATA_LABEL}</span>
          {metadataEnabled ? null : <span className={styles.aviso}>{METADATA_BLOCKED}</span>}
        </span>
      </label>
    </fieldset>
  );
}

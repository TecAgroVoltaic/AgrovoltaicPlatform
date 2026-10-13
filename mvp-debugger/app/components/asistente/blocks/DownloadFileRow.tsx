"use client";
// Un archivo del plan: punto(s) de fuente, nombre, filas y columnas, y su botón.
// Cada renglón baja con su propio controlador: progreso y cancelación por archivo.
import { DownloadAction } from "@/app/components/asistente/blocks/DownloadAction";
import { downloadStatusText } from "@/app/components/asistente/blocks/downloadStatus";
import shared from "@/app/components/asistente/blocks/blockCard.module.css";
import styles from "@/app/components/asistente/blocks/downloads.module.css";
import { SourceDot } from "@/app/components/fuentes/SourceDot";
import type { PlannedFile } from "@/app/lib/asistente/contracts/descargasSpec";
import { formatCount } from "@/app/lib/descargas/format";
import { throughHistoricoProxy } from "@/app/lib/descargas/proxy";
import { useDescarga, type DownloadDeps } from "@/app/lib/descargas/useDescarga";

export type DownloadFileRowProps = {
  readonly file: PlannedFile;
  /** Sin confirmar un plan grande, el archivo se muestra pero no se baja. */
  readonly locked: boolean;
  readonly deps?: DownloadDeps;
};

export function DownloadFileRow({ file, locked, deps }: DownloadFileRowProps) {
  const { state, start, cancel } = useDescarga(deps);
  const columnNames = file.columnas.map((column) => column.etiqueta).join(", ");
  const summary = `${formatCount(file.filas_estimadas)} filas · ${file.columnas.length} col.`;

  return (
    <li className={styles.row}>
      <span className={styles.dots}>
        {file.fuentes.map((source) => (
          <SourceDot key={source} source={source} />
        ))}
      </span>
      <div className={styles.fileText}>
        <p className={styles.fileName} title={file.nombre}>
          {file.nombre}
        </p>
        <p className={styles.fileMeta} title={columnNames} aria-live="polite">
          {downloadStatusText(state) ?? summary}
        </p>
      </div>
      {locked ? null : (
        <DownloadAction
          busy={state.status === "downloading"}
          label={`Descargar ${file.nombre}`}
          iconOnly
          onStart={() => void start(throughHistoricoProxy(file.url), file.nombre)}
          onCancel={cancel}
        />
      )}
      {state.status === "error" ? (
        <p className={`${shared.alert} ${styles.rowError}`} role="alert">
          No se pudo descargar: {state.message}
        </p>
      ) : null}
    </li>
  );
}

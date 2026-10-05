"use client";
// Lo último que se lee antes de bajar el archivo: qué entra, cuánto pesa en
// filas y qué queda fuera.
//
// El botón es un ENLACE de verdad y no un fetch a un blob: así el archivo lo
// baja el gestor de descargas del navegador en streaming (una exportación de
// noventa mil filas no se copia entera en memoria de la pestaña) y el nombre
// sale del `Content-Disposition` que manda el backend, que es justo lo que el
// proxy binario se encarga de reenviar.
import {
  formatApproximate,
  formatColumns,
  formatRows,
} from "@/app/components/analitica/descargas/format";
import { LARGE_DOWNLOAD_ROWS, type RelationScope } from "@/app/components/analitica/descargas/scope";
import styles from "@/app/components/analitica/descargas/vista.module.css";
import { addDays, type DateRange } from "@/app/lib/analitica/dateRange";
import type { DownloadFormat } from "@/app/components/analitica/descargas/download";

export type DownloadPanelProps = {
  readonly range: DateRange;
  readonly scope: RelationScope;
  readonly columnCount: number;
  readonly format: DownloadFormat;
  readonly href: string;
};

const TITLE = "4. Descargar";
const NO_COLUMNS_BLOCK = "Elegí al menos una columna: un archivo sin columnas no tiene nada dentro.";
const OUT_OF_RANGE_BLOCK = "Este rango no toca la cobertura de la tabla elegida.";
const LARGE_WARNING = "Es una descarga grande: puede tardar y abrirla en una hoja de cálculo también.";
const ESTIMATE_HINT = "Es una estimación por densidad media de la tabla; el conteo exacto lo trae el archivo.";

export function DownloadPanel({ range, scope, columnCount, format, href }: DownloadPanelProps) {
  const blocked = blockReason(scope, columnCount);
  const rows = scope.kind === "outside" ? null : estimatedRowsOf(scope);
  return (
    <section className="card" aria-label={TITLE}>
      <h2 className={styles.leyenda}>{TITLE}</h2>

      {/* Con una tabla que el rango no recorta, esta línea sería falsa: ahí el
          archivo trae todo, y lo dice el aviso del alcance. */}
      {scope.kind === "whole" ? null : (
        <p className={styles.resumen}>
          Del <b>{range.from}</b> al <b>{addDays(range.toExclusive, -1)}</b> inclusive.{" "}
          <b>«hasta» es exclusivo</b>: el {range.toExclusive} no entra en el archivo.
        </p>
      )}

      {rows === null ? null : (
        <p className={styles.cifra}>
          <span className="mono">
            {scope.kind === "whole" ? formatRows(rows) : `${formatApproximate(rows)} filas`}
          </span>{" "}
          <span className="muted small">· {formatColumns(columnCount)}</span>
        </p>
      )}
      {rows !== null && scope.kind !== "whole" ? (
        <p className="muted small">{ESTIMATE_HINT}</p>
      ) : null}
      {rows !== null && rows >= LARGE_DOWNLOAD_ROWS ? (
        <p className={styles.aviso} role="status">
          {LARGE_WARNING}
        </p>
      ) : null}

      {"notice" in scope ? (
        <p className={styles.aviso} role="status">
          {scope.notice}
        </p>
      ) : null}

      {blocked ? (
        <>
          <button type="button" className="btn" disabled>
            Descargar .{format}
          </button>
          <p className={styles.aviso}>{blocked}</p>
        </>
      ) : (
        <a className="btn" href={href} download>
          Descargar .{format}
        </a>
      )}
    </section>
  );
}

function estimatedRowsOf(scope: RelationScope): number | null {
  if (scope.kind === "whole") return scope.rows;
  if (scope.kind === "outside") return null;
  return scope.estimatedRows;
}

/** Por qué NO se puede descargar todavía, o null si se puede. */
function blockReason(scope: RelationScope, columnCount: number): string | null {
  if (columnCount === 0) return NO_COLUMNS_BLOCK;
  if (scope.kind === "outside") return OUT_OF_RANGE_BLOCK;
  return null;
}

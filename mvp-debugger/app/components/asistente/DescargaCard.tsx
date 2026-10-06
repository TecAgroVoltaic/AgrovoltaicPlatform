"use client";
// La ficha de una descarga que ofreció el asistente (`_descarga`, contrato §2).
// El archivo lo baja el mismo hook que la vista Descargas, contra el mismo
// `GET /datos/exportar`: el asistente no tiene una forma propia de exportar.
import { useMemo } from "react";

import { IconDownload } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/cards.module.css";
import controls from "@/app/components/asistente/controls.module.css";
import { parseDescargaSpec, type DescargaSpec } from "@/app/lib/asistente/contracts/descargaSpec";
import { formatBytes, formatCount } from "@/app/lib/descargas/format";
import { useDescarga, type DownloadDeps } from "@/app/lib/descargas/useDescarga";
import { ETIQUETA_ZONA } from "@/app/lib/tiempo";

/** El proxy del servicio histórico: la `url` del spec es relativa a él. */
const HISTORICO_PROXY = "/api/historico";
const ICON_SIZE = 13;
const ICON_STROKE = 2.2;

export type DescargaCardProps = { readonly spec: unknown; readonly deps?: DownloadDeps };

export function DescargaCard({ spec, deps }: DescargaCardProps) {
  const parsed = useMemo(() => parseDescargaSpec(spec), [spec]);
  if (!parsed.ok) {
    return (
      <div className={`${styles.card} ${styles.download}`} role="alert">
        <div className={styles.fileText}>
          <p className={styles.fileName}>La descarga que ofreció el asistente no es válida</p>
          <p className={styles.fileMeta}>{parsed.reason}</p>
        </div>
      </div>
    );
  }
  return <ValidDescargaCard spec={parsed.spec} deps={deps} />;
}

function ValidDescargaCard({ spec, deps }: { spec: DescargaSpec; deps?: DownloadDeps }) {
  const { state, start, cancel } = useDescarga(deps);
  const rows = `${spec.cota ? "≈ " : ""}${formatCount(spec.filas_estimadas)} filas`;
  const columns = spec.columnas && spec.columnas.length > 0 ? spec.columnas : null;
  const range = spec.desde && spec.hasta ? `${spec.desde} a ${spec.hasta}` : null;
  const empty = spec.filas_estimadas === 0;

  return (
    <div className={styles.card} role="group" aria-label={`Descarga: ${spec.nombre_sugerido}`}>
      <div className={styles.download}>
        <div className={styles.fileIcon} aria-hidden="true">
          {spec.formato}
        </div>
        <div className={styles.fileText}>
          <p className={styles.fileName} title={spec.nombre_sugerido}>
            {spec.nombre_sugerido}
          </p>
          {/* `hasta` llega INCLUSIVO, como lo toma `GET /datos/exportar`: se
              muestra tal cual, sin correrlo. */}
          <p className={styles.fileMeta} title={range ?? undefined}>
            <span className={styles.fileMetaLong}>
              {rows} estimadas · {columns ? columns.join(", ") : spec.tabla} · {ETIQUETA_ZONA}
            </span>
            <span className={styles.fileMetaShort}>
              {rows}
              {columns ? ` · ${columns.length} columnas` : ""}
            </span>
          </p>
          <p className={styles.fileStatus} role="status">
            {empty ? "No hay filas en ese rango: no hay nada que descargar." : null}
            {state.status === "done" ? `Listo · ${formatBytes(state.bytes)} · ${state.fileName}` : null}
            {state.status === "cancelled" ? "Descarga cancelada." : null}
          </p>
        </div>
        {empty ? null : (
          <div className={styles.fileActions}>
            {state.status === "downloading" ? (
              <>
                <button className={controls.actionPrimary} type="button" disabled>
                  {state.bytes ? `${formatBytes(state.bytes)} recibidos` : "Preparando…"}
                </button>
                <button className={controls.action} type="button" onClick={cancel}>
                  Cancelar
                </button>
              </>
            ) : (
              <button
                className={`${controls.actionPrimary} ${controls.iconOnMobile}`}
                type="button"
                aria-label={state.status === "done" ? "Descargar otra vez" : "Descargar"}
                onClick={() => void start(`${HISTORICO_PROXY}${spec.url}`, spec.nombre_sugerido)}
              >
                <IconDownload size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                <span className={controls.collapsible}>
                  {state.status === "done" ? "Descargar otra vez" : "Descargar"}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
      {state.status === "error" ? (
        <div className={styles.downloadError}>
          <div className="alert" role="alert">
            No se pudo descargar: {state.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}

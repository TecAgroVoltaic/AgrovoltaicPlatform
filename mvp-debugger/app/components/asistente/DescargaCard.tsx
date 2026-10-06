"use client";
// La ficha de una descarga que ofreció el asistente (`_descarga`, contrato §2).
// El archivo lo baja el mismo hook que la vista Descargas, contra el mismo
// `GET /datos/exportar`: el asistente no tiene una forma propia de exportar.
import { useMemo } from "react";

import styles from "@/app/components/asistente/asistente.module.css";
import { parseDescargaSpec, type DescargaSpec } from "@/app/lib/asistente/contracts/descargaSpec";
import { formatBytes, formatCount } from "@/app/lib/descargas/format";
import { useDescarga, type DownloadDeps } from "@/app/lib/descargas/useDescarga";

/** El proxy del servicio histórico: la `url` del spec es relativa a él. */
const HISTORICO_PROXY = "/api/historico";

export type DescargaCardProps = { readonly spec: unknown; readonly deps?: DownloadDeps };

export function DescargaCard({ spec, deps }: DescargaCardProps) {
  const parsed = useMemo(() => parseDescargaSpec(spec), [spec]);
  if (!parsed.ok) {
    return (
      <div className={styles.card} role="alert">
        <p className={styles.cardTitle}>La descarga que ofreció el asistente no es válida</p>
        <p className="muted small">{parsed.reason}</p>
      </div>
    );
  }
  return <ValidDescargaCard spec={parsed.spec} deps={deps} />;
}

function ValidDescargaCard({ spec, deps }: { spec: DescargaSpec; deps?: DownloadDeps }) {
  const { state, start, cancel } = useDescarga(deps);
  const rows = `${spec.cota ? "≈ " : ""}${formatCount(spec.filas_estimadas)} filas${spec.cota ? " (estimado)" : ""}`;
  const range = describeRange(spec.desde, spec.hasta);

  return (
    <div className={styles.card}>
      <p className={`${styles.cardTitle} mono`} title={spec.nombre_sugerido}>
        {spec.nombre_sugerido}
      </p>
      <p className={`${styles.cardMeta} mono`}>
        {spec.formato.toUpperCase()} · {rows} · {spec.tabla}
        {range ? ` · ${range}` : ""}
      </p>
      {spec.filas_estimadas === 0 ? (
        <p className="muted small">No hay filas en ese rango: no hay nada que descargar.</p>
      ) : state.status === "downloading" ? (
        <div className={styles.cardActions}>
          <button className="btn" type="button" disabled>
            Preparando… {state.bytes ? `${formatBytes(state.bytes)} recibidos` : "esperando al servidor"}
          </button>
          <button className="btn ghost sm" type="button" onClick={cancel}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className={styles.cardActions}>
          <button
            className="btn"
            type="button"
            onClick={() => void start(`${HISTORICO_PROXY}${spec.url}`, spec.nombre_sugerido)}
          >
            {state.status === "done" ? "Descargar otra vez" : "Descargar"}
          </button>
        </div>
      )}
      <p className="muted small" role="status">
        {state.status === "done" ? `Listo · ${formatBytes(state.bytes)} · ${state.fileName}` : null}
        {state.status === "cancelled" ? "Descarga cancelada." : null}
      </p>
      {state.status === "error" ? (
        <div className="alert" role="alert">
          No se pudo descargar: {state.message}
        </div>
      ) : null}
    </div>
  );
}

/** `hasta` llega INCLUSIVO, como lo toma `GET /datos/exportar` (contrato §2):
 * se muestra tal cual, sin correrlo. */
function describeRange(from: string | null | undefined, to: string | null | undefined): string | null {
  return from && to ? `${from} a ${to}` : null;
}

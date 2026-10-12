"use client";
// Los archivos de un plan de exportación (`_descargas`, contrato §4.1): una
// lista compacta y, abajo, «Descargar todo (.zip)». Si el plan pasa el umbral
// de filas, nada se baja hasta «Confirmar y descargar».
import { useMemo, useState } from "react";

import { IconArchive } from "@/app/components/asistente/AssistantIcons";
import { DownloadAction } from "@/app/components/asistente/blocks/DownloadAction";
import { DownloadFileRow } from "@/app/components/asistente/blocks/DownloadFileRow";
import { InvalidBlock } from "@/app/components/asistente/blocks/InvalidBlock";
import { downloadStatusText } from "@/app/components/asistente/blocks/downloadStatus";
import shared from "@/app/components/asistente/blocks/blockCard.module.css";
import styles from "@/app/components/asistente/blocks/downloads.module.css";
import { parseDescargasSpec, type DescargasSpec } from "@/app/lib/asistente/contracts/descargasSpec";
import { formatCount } from "@/app/lib/descargas/format";
import { throughHistoricoProxy } from "@/app/lib/descargas/proxy";
import { useDescarga, type DownloadDeps } from "@/app/lib/descargas/useDescarga";

const ICON_SIZE = 16;
const ZIP_FALLBACK_NAME = "agrovoltaic-archivos.zip";

export type DownloadsCardProps = { readonly spec: unknown; readonly deps?: DownloadDeps };

export function DownloadsCard({ spec, deps }: DownloadsCardProps) {
  const parsed = useMemo(() => parseDescargasSpec(spec), [spec]);
  if (!parsed.ok) return <InvalidBlock what="La lista de archivos" reason={parsed.reason} />;
  return <ValidDownloadsCard spec={parsed.spec} deps={deps} />;
}

function ValidDownloadsCard({ spec, deps }: { readonly spec: DescargasSpec; readonly deps?: DownloadDeps }) {
  const [confirmed, setConfirmed] = useState(!spec.requiere_confirmacion);
  const bundle = useDescarga(deps);
  const [onlyFile] = spec.archivos;
  // Todo junto: el zip, o el único archivo si el plan tiene uno solo.
  const bundleUrl = spec.zip_url ?? (spec.archivos.length === 1 && onlyFile ? onlyFile.url : null);
  const bundleName = spec.zip_url ? ZIP_FALLBACK_NAME : (onlyFile?.nombre ?? ZIP_FALLBACK_NAME);
  const showBundle = !confirmed || (bundleUrl !== null && (spec.zip_url !== null || bundle.state.status !== "idle"));
  const label = bundleLabel(confirmed, bundleUrl !== null, spec.zip_url !== null);
  const fileCount = spec.archivos.length === 1 ? "1 archivo" : `${spec.archivos.length} archivos`;

  const startBundle = () => {
    setConfirmed(true);
    if (bundleUrl) void bundle.start(throughHistoricoProxy(bundleUrl), bundleName);
  };

  return (
    <section className={shared.card} aria-label={`Archivos para descargar: ${fileCount}`}>
      <div className={shared.head}>
        <IconArchive size={ICON_SIZE} />
        <p className={shared.title}>{fileCount}</p>
        <p className={shared.headMeta}>{formatCount(spec.total_filas)} filas</p>
      </div>
      <ul className={styles.files}>
        {spec.archivos.map((file) => (
          <DownloadFileRow key={file.indice} file={file} locked={!confirmed} deps={deps} />
        ))}
      </ul>
      {showBundle ? (
        <div className={styles.footer}>
          {!confirmed ? (
            <p className={styles.total}>Son {formatCount(spec.total_filas)} filas: confirmá antes de generar.</p>
          ) : (
            <p className={styles.footerStatus} aria-live="polite">
              {downloadStatusText(bundle.state)}
            </p>
          )}
          <DownloadAction busy={bundle.state.status === "downloading"} label={label} onStart={startBundle} onCancel={bundle.cancel} />
        </div>
      ) : null}
      {bundle.state.status === "error" ? (
        <p className={shared.alert} role="alert">
          No se pudo descargar: {bundle.state.message}
        </p>
      ) : null}
    </section>
  );
}

/** Sin zip (contrato: solo con un archivo) confirmar solo habilita los renglones. */
function bundleLabel(confirmed: boolean, hasBundle: boolean, isZip: boolean): string {
  if (!confirmed) return hasBundle ? "Confirmar y descargar" : "Confirmar";
  return isZip ? "Descargar todo (.zip)" : "Descargar";
}

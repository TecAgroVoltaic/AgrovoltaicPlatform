// El botón Descargar con su progreso, la cancelación y el resultado.
import { formatBytes } from "@/app/lib/descargas/format";
import type { DownloadController } from "@/app/lib/descargas/useDescarga";

import type { ExportFormat } from "./types";

type DownloadControlsProps = {
  readonly download: DownloadController;
  readonly format: ExportFormat;
  readonly ready: boolean;
  readonly onDownload: () => void;
};

export function DownloadControls({ download, format, ready, onDownload }: DownloadControlsProps) {
  const state = download.state;
  return (
    <>
      {state.status === "downloading" ? (
        <>
          <button className="btn dl-btn" disabled>Preparando… {state.bytes ? formatBytes(state.bytes) + " recibidos" : "esperando al servidor"}</button>
          <button className="btn ghost sm" style={{ width: "100%", marginTop: 8 }} onClick={download.cancel}>Cancelar</button>
          {state.bytes === 0 && <p className="muted small" style={{ margin: "8px 0 0" }}>{format === "mat" ? "El .mat se arma completo antes de enviarse: puede tardar." : "AgroDash se consulta sensor por sensor: puede tardar."}</p>}
        </>
      ) : (
        <button className="btn dl-btn" disabled={!ready} onClick={onDownload}>Descargar</button>
      )}
      {state.status === "error" && <div className="alert" style={{ marginBottom: 0 }}>No se pudo descargar: {state.message}</div>}
      {state.status === "done" && <p className="muted small mono" style={{ margin: "8px 0 0" }}>listo · {formatBytes(state.bytes)} · {state.fileName}</p>}
    </>
  );
}

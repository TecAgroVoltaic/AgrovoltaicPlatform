// El estado de una descarga en pocas palabras, para el renglón de su archivo.
import type { DownloadState } from "@/app/lib/descargas/useDescarga";
import { formatBytes } from "@/app/lib/descargas/format";

export function downloadStatusText(state: DownloadState): string | null {
  switch (state.status) {
    case "downloading":
      return state.bytes ? `${formatBytes(state.bytes)} recibidos` : "Preparando…";
    case "done":
      return `Listo · ${formatBytes(state.bytes)}`;
    case "cancelled":
      return "Cancelada";
    case "error":
    case "idle":
      return null;
  }
}

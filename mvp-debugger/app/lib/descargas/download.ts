// Bajar un archivo del proxy leyendo el cuerpo por partes, para poder contar los
// bytes mientras llegan. Un `<a download>` directo no avisa nada mientras el
// servidor arma el archivo (un .mat grande o AgroDash en crudo tardan minutos)
// y además esconde los errores: por eso se hace con fetch.
import type { HttpFetch } from "@/app/lib/analitica/client";

export type DownloadedFile = {
  readonly blob: Blob;
  readonly bytes: number;
  /** El nombre que manda el servidor en `content-disposition`, si lo manda. */
  readonly serverFileName: string | null;
};

const FILENAME_PATTERN = /filename="?([^";]+)"?/;
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

export class DownloadHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "DownloadHttpError";
  }
}

/**
 * Baja `url` entero a un Blob. Lanza `DownloadHttpError` si el servicio
 * responde con error (con el `detail`/`error` del cuerpo como mensaje) y deja
 * pasar el `AbortError` tal cual: cancelar no es un fallo y quien llama lo
 * distingue por nombre.
 */
export async function downloadFile(
  url: string,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
  httpFetch: HttpFetch = globalThis.fetch,
): Promise<DownloadedFile> {
  const response = await httpFetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw await httpError(response);

  const parts: BlobPart[] = [];
  let bytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        parts.push(value);
        bytes += value.byteLength;
        onProgress(bytes);
      }
    }
  } else {
    const blob = await response.blob();
    parts.push(blob);
    bytes = blob.size;
  }

  const contentType = response.headers.get("content-type") || FALLBACK_CONTENT_TYPE;
  const disposition = response.headers.get("content-disposition") || "";
  return {
    blob: new Blob(parts, { type: contentType }),
    bytes,
    serverFileName: FILENAME_PATTERN.exec(disposition)?.[1] ?? null,
  };
}

async function httpError(response: Response): Promise<DownloadHttpError> {
  const fallback = `el servicio respondió ${response.status}`;
  const body: unknown = await response.json().catch(() => null);
  if (body !== null && typeof body === "object") {
    const detail = "detail" in body ? body.detail : "error" in body ? body.error : null;
    if (typeof detail === "string" && detail) return new DownloadHttpError(detail, response.status);
  }
  return new DownloadHttpError(fallback, response.status);
}

const OBJECT_URL_LIFETIME_MS = 60_000;

/** Entrega el Blob al navegador como archivo. Es el único efecto sobre el DOM
 * de una descarga, y por eso va aparte: los tests lo sustituyen. */
export function saveBlobAsFile(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), OBJECT_URL_LIFETIME_MS);
}

"use client";
// Una descarga con feedback: progreso en bytes, error en pantalla y cancelar.
// La usan la vista Descargas y las tarjetas `_descarga` del asistente, para que
// haya UNA sola forma de bajar un archivo del servicio histórico.
import { useCallback, useEffect, useRef, useState } from "react";

import type { HttpFetch } from "@/app/lib/analitica/client";
import { downloadFile, saveBlobAsFile } from "@/app/lib/descargas/download";

export type DownloadState =
  | { readonly status: "idle" }
  | { readonly status: "downloading"; readonly bytes: number }
  | { readonly status: "done"; readonly bytes: number; readonly fileName: string }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "cancelled" };

export type DownloadDeps = {
  readonly httpFetch?: HttpFetch;
  readonly saveFile?: (blob: Blob, fileName: string) => void;
};

export type DownloadController = {
  readonly state: DownloadState;
  /** Baja `url` (ya con el prefijo del proxy). `fallbackFileName` se usa si el
   * servidor no manda `content-disposition`. Ignora la llamada si ya hay una
   * descarga en curso: dos clics no bajan dos veces. */
  readonly start: (url: string, fallbackFileName: string) => Promise<void>;
  readonly cancel: () => void;
};

const IDLE: DownloadState = { status: "idle" };

export function useDescarga({ httpFetch, saveFile = saveBlobAsFile }: DownloadDeps = {}): DownloadController {
  const [state, setState] = useState<DownloadState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);

  // Salir de la pantalla corta la descarga: seguir leyendo bytes de un archivo
  // que ya nadie va a recibir es memoria y red tiradas.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(
    async (url: string, fallbackFileName: string) => {
      if (controllerRef.current) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "downloading", bytes: 0 });
      try {
        const file = await downloadFile(
          url,
          controller.signal,
          (bytes) => setState({ status: "downloading", bytes }),
          httpFetch,
        );
        const fileName = file.serverFileName ?? fallbackFileName;
        saveFile(file.blob, fileName);
        setState({ status: "done", bytes: file.bytes, fileName });
      } catch (error) {
        setState(
          isAbort(error)
            ? { status: "cancelled" }
            : { status: "error", message: error instanceof Error ? error.message : String(error) },
        );
      } finally {
        controllerRef.current = null;
      }
    },
    [httpFetch, saveFile],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  return { state, start, cancel };
}

/** Por nombre y no por clase: según el entorno, el aborto llega como
 * `DOMException` o como `Error`. */
function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

"use client";
// Pedir el informe en Excel y saber qué está pasando: el informe llega entero al
// final (no hay bytes parciales que contar), así que el progreso es el tiempo
// transcurrido. Lo comparten el botón de Descargas y la tarjeta del asistente.
import { useCallback, useEffect, useRef, useState } from "react";

import { bajarArchivo } from "./bajar";

/** La cabecera con que el servicio avisa que el informe salió sin la lectura del agente. */
export const READING_HEADER = "x-informe-lectura";
export const WITHOUT_READING = "sin_lectura";

const FALLBACK_FILE_NAME = "informe-agrovoltaic-sc.xlsx";
const TICK_MS = 1000;

export type ReportState =
  | { readonly phase: "idle" }
  | { readonly phase: "generating"; readonly seconds: number }
  | { readonly phase: "error"; readonly reason: string }
  | { readonly phase: "done"; readonly fileName: string; readonly withoutReading: boolean };

export type ReportDownload = {
  readonly state: ReportState;
  readonly generate: () => Promise<void>;
  readonly cancel: () => void;
};

/** `url` ya con el prefijo del proxy. `expectsReading`: el informe pidió la
 *  lectura del agente, así que su ausencia se avisa. */
export function useReportDownload(url: string, expectsReading: boolean): ReportDownload {
  const [state, setState] = useState<ReportState>({ phase: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const generating = state.phase === "generating";

  useEffect(() => {
    if (!generating) return;
    const clock = setInterval(
      () => setState((current) => (current.phase === "generating" ? { phase: "generating", seconds: current.seconds + 1 } : current)),
      TICK_MS,
    );
    return () => clearInterval(clock);
  }, [generating]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const generate = useCallback(async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ phase: "generating", seconds: 0 });
    try {
      const file = await bajarArchivo(url, { signal: controller.signal, porDefecto: FALLBACK_FILE_NAME });
      const withoutReading = expectsReading && file.cabeceras.get(READING_HEADER) === WITHOUT_READING;
      setState({ phase: "done", fileName: file.archivo, withoutReading });
    } catch (error) {
      setState(isAbort(error) ? { phase: "idle" } : { phase: "error", reason: errorMessage(error) });
    } finally {
      controllerRef.current = null;
    }
  }, [url, expectsReading]);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  return { state, generate, cancel };
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

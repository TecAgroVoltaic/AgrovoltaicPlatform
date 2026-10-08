"use client";
// Cuántas filas traería la exportación y sus primeras filas, pedidas con un
// respiro (debounce) mientras la persona sigue cambiando el formulario.
import { useEffect, useState } from "react";

import { jget, mensajeError, type Resp } from "@/app/lib/client";

import { ESTIMATE_DEBOUNCE_MS, ESTIMATE_PATH, PREVIEW_PATH, PREVIEW_ROWS } from "./constants";
import type { ExportDataset, ExportEstimate, ExportPreviewData } from "./types";

const UNEXPECTED_RESPONSE = "respuesta inesperada";

type EstimateInput = {
  readonly dataset: ExportDataset | null;
  readonly hasTime: boolean;
  readonly from: string;
  readonly to: string;
  readonly params: URLSearchParams;
  readonly columnsParam: string;
};

export type ExportEstimateState = {
  readonly estimate: ExportEstimate | null;
  readonly preview: ExportPreviewData | null;
  readonly error: string | null;
  readonly estimating: boolean;
  readonly clear: () => void;
};

export function useExportEstimate({ dataset, hasTime, from, to, params, columnsParam }: EstimateInput): ExportEstimateState {
  const [estimate, setEstimate] = useState<ExportEstimate | null>(null);
  const [preview, setPreview] = useState<ExportPreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    if (!dataset) return;
    if (hasTime && (!from || !to)) { setEstimate(null); setPreview(null); return; }
    setEstimating(true); setError(null);
    const id = setTimeout(() => {
      const previewParams = new URLSearchParams(params);
      previewParams.set("n", String(PREVIEW_ROWS));
      if (columnsParam) previewParams.set("columnas", columnsParam);
      Promise.all([
        jget(`${ESTIMATE_PATH}?${params.toString()}`),
        jget(`${PREVIEW_PATH}?${previewParams.toString()}`),
      ]).then(([e, p]: Resp[]) => {
        if (!e.ok || typeof e.data?.filas !== "number") {
          setEstimate(null); setPreview(null); setError(e.ok ? UNEXPECTED_RESPONSE : mensajeError(e));
          return;
        }
        setEstimate(e.data);
        setPreview(p.ok && Array.isArray(p.data?.filas) ? p.data : null);
      }).catch((e) => setError(String(e?.message || e))).finally(() => setEstimating(false));
    }, ESTIMATE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [dataset, hasTime, from, to, params, columnsParam]);

  const clear = () => { setEstimate(null); setPreview(null); setError(null); };
  return { estimate, preview, error, estimating, clear };
}

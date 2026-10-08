"use client";
// Lo que la persona eligió para exportar: fuente, conjunto de datos, filtros,
// rango, formato y columnas, más el paso abierto del acordeón. Baja el catálogo
// y elige la fuente y el conjunto iniciales apenas llega.
import { useMemo, useState } from "react";

import { hoyEnSitio, moverDias } from "@/app/lib/tiempo";

import {
  DEFAULT_FORMAT, FALLBACK_ALL_HISTORY_DAYS, FALLBACK_COVERAGE_DAYS, INITIAL_DATASET, INITIAL_STEP,
  INITIAL_WINDOW_DAYS, PREFERRED_SOURCE, RANGE_PRESET_DAYS, RAW_STEP,
} from "./constants";
import { dayOf } from "./helpers";
import type { ExportCatalog, ExportDataset, ExportFormat, RangePresetId, StepId } from "./types";
import { useColumnSelection } from "./useColumnSelection";
import { useDescargasCatalog } from "./useDescargasCatalog";

export function useExportForm() {
  const [openStep, setOpenStep] = useState<StepId | null>(INITIAL_STEP);
  const [source, setSource] = useState(PREFERRED_SOURCE);
  const [datasetKey, setDatasetKey] = useState(INITIAL_DATASET);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<ExportFormat>(DEFAULT_FORMAT);
  const [boxes, setBoxes] = useState<Set<string>>(new Set());     // vacío = todas
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(RAW_STEP);
  const catalogState = useDescargasCatalog(applyCatalog);
  const { catalog } = catalogState;

  const activeSource = useMemo(() => catalog?.fuentes.find((f) => f.clave === source) || null, [catalog, source]);
  const dataset = useMemo(() => activeSource?.datasets.find((d) => d.clave === datasetKey) || null, [activeSource, datasetKey]);
  const columns = useColumnSelection(dataset);
  const hasTime = !!dataset?.columna_tiempo;
  const hasFilters = (dataset?.filtros?.length ?? 0) > 0 && !!activeSource?.cajas?.length;
  const hasStep = (dataset?.pasos?.length ?? 0) > 0;
  const coverageStart = dayOf(dataset?.desde), coverageEnd = dayOf(dataset?.hasta);

  function applyCatalog(loaded: ExportCatalog) {
    const initialSource = loaded.fuentes.find((x) => x.clave === PREFERRED_SOURCE && x.disponible)
      || loaded.fuentes.find((x) => x.disponible) || loaded.fuentes[0];
    if (!initialSource) return;
    const initialDataset = initialSource.datasets.find((d) => d.clave === INITIAL_DATASET) || initialSource.datasets[0];
    setSource(initialSource.clave);
    if (initialDataset) { setDatasetKey(initialDataset.clave); applyInitialRange(initialDataset); }
  }
  function setFromKeepingOrder(value: string) { setFrom(value); if (value && to && to < value) setTo(value); }
  function setToKeepingOrder(value: string) { setTo(value); if (value && from && value < from) setFrom(value); }
  function applyInitialRange(target: ExportDataset) {
    const end = dayOf(target.hasta) || hoyEnSitio();
    const start = dayOf(target.desde) || moverDias(end, -FALLBACK_COVERAGE_DAYS);
    const windowStart = moverDias(end, -INITIAL_WINDOW_DAYS);
    setFrom(windowStart < start ? start : windowStart); setTo(end);
  }
  function applyPreset(preset: RangePresetId) {
    const end = coverageEnd || hoyEnSitio(), start = coverageStart || moverDias(end, -FALLBACK_ALL_HISTORY_DAYS);
    if (preset === "todo") { setFrom(start); setTo(end); return; }
    const presetStart = moverDias(end, -RANGE_PRESET_DAYS[preset]);
    setFrom(presetStart < start ? start : presetStart); setTo(end);
  }
  function resetFilters() { columns.clear(); setBoxes(new Set()); setTypes(new Set()); setStep(RAW_STEP); }
  /** Devuelve si cambió de fuente, para que la vista descarte la estimación vieja. */
  function chooseSource(key: string): boolean {
    const target = catalog?.fuentes.find((x) => x.clave === key);
    if (!target || !target.disponible) return false;
    setSource(key); resetFilters();
    const first = target.datasets[0];
    if (first) { setDatasetKey(first.clave); applyInitialRange(first); }
    setOpenStep("datos");
    return true;
  }
  /** Devuelve si eligió un conjunto, para que la vista descarte la estimación vieja. */
  function chooseDataset(key: string): boolean {
    const target = activeSource?.datasets.find((x) => x.clave === key);
    if (!target) return false;
    setDatasetKey(key); resetFilters(); applyInitialRange(target);
    setOpenStep(target.filtros.length && activeSource?.cajas?.length ? "filtros" : "rango");
    return true;
  }

  const params = useMemo(() => {
    const p = new URLSearchParams({ fuente: source, tabla: datasetKey });
    if (hasTime) { p.set("desde", from); p.set("hasta", to); }
    if (boxes.size) p.set("caja", [...boxes].join(","));
    if (types.size) p.set("sensor_tipo", [...types].join(","));
    if (hasStep && step) p.set("paso", String(step));
    return p;
  }, [source, datasetKey, hasTime, from, to, boxes, types, hasStep, step]);

  return {
    catalogState, activeSource, dataset, columns, params,
    source, datasetKey, from, to, format, boxes, types, step, openStep,
    hasTime, hasFilters, hasStep, coverageStart, coverageEnd,
    setFormat, setBoxes, setTypes, setStep,
    setFrom: setFromKeepingOrder, setTo: setToKeepingOrder, applyPreset, chooseSource, chooseDataset,
    toggleStep: (id: StepId) => setOpenStep(openStep === id ? null : id),
  };
}

export type ExportForm = ReturnType<typeof useExportForm>;

"use client";
// Descargas: exportar un rango de fechas de un dataset (Supabase PV o API de
// AgroDash) como CSV, DAT o MAT. Diseño compacto: un ACORDEÓN de pasos a la
// izquierda (un paso abierto a la vez; los cerrados resumen su valor en una
// línea) y un panel fijo a la derecha con estimación, vista previa plegable y
// el botón. Las listas largas (cajas, tipos, columnas) usan un selector con
// búsqueda y paginación. La descarga es un GET directo al proxy.
//
// Este archivo solo ensambla: el estado vive en `useExportForm` y
// `useExportEstimate`, y cada paso es su propio componente.
import { Estado } from "@/app/components/console/Estado";
import { useDescarga } from "@/app/lib/descargas/useDescarga";

import { ColumnPicker } from "./ColumnPicker";
import { BYTES_PER_CELL_MAT, BYTES_PER_CELL_TEXT, EXPORT_PATH } from "./constants";
import { DatasetPicker } from "./DatasetPicker";
import { DownloadControls } from "./DownloadControls";
import { EstimatePanel } from "./EstimatePanel";
import { ExportPreview } from "./ExportPreview";
import { FiltersPanel } from "./FiltersPanel";
import { FormatPicker } from "./FormatPicker";
import { exportFileName } from "./helpers";
import { RangePanel } from "./RangePanel";
import { SourcePicker } from "./SourcePicker";
import type { StepFrame, StepId } from "./types";
import { useExportEstimate } from "./useExportEstimate";
import { useExportForm } from "./useExportForm";

export function DescargasView() {
  const form = useExportForm();
  const { catalog, error: catalogError, retry } = form.catalogState;
  const { dataset, columns, params, format, from, to, hasTime } = form;
  const estimate = useExportEstimate({ dataset, hasTime, from, to, params, columnsParam: columns.param });
  const download = useDescarga();

  const rows = estimate.estimate?.filas ?? 0;
  const maxMat = catalog?.max_filas_mat ?? Infinity;
  const exceedsMat = format === "mat" && rows > maxMat;
  const columnCount = columns.selected.length + (format === "csv" ? 0 : 1);
  const sizeBytes = rows * columnCount * (format === "mat" ? BYTES_PER_CELL_MAT : BYTES_PER_CELL_TEXT);
  const invalidRange = hasTime && !!from && !!to && to < from;
  const ready = !!dataset && !estimate.error && !estimate.estimating && !invalidRange && rows > 0 && !exceedsMat;

  const downloadParams = new URLSearchParams(params);
  downloadParams.set("formato", format);
  if (columns.param) downloadParams.set("columnas", columns.param);
  const url = `${EXPORT_PATH}?${downloadParams.toString()}`;
  const fileName = exportFileName({
    source: form.source, dataset: form.datasetKey, boxes: form.boxes, hasTime, from, to, format,
  });

  let stepNumber = 0;
  const frame = (id: StepId): StepFrame => ({
    number: ++stepNumber, open: form.openStep === id, onToggle: () => form.toggleStep(id),
  });

  return (
    <section>
      <div className="phead">
        <h1>Descargas</h1>
        <p>Un rango de fechas → un archivo. Supabase PV o API de AgroDash · CSV, DAT o MAT · solo lectura · hora local (UTC−6).</p>
      </div>

      {!catalog ? (
        <div className="card" style={{ marginTop: 22 }}>
          <Estado cargando={!catalogError} error={catalogError} que="el catálogo de datos" onReintentar={retry} />
        </div>
      ) : (
        <div className="dl">
          <div className="dl-main">
            <SourcePicker {...frame("fuente")} sources={catalog.fuentes} selectedKey={form.source}
                          summary={form.activeSource?.titulo ?? "—"}
                          onChoose={(key) => { if (form.chooseSource(key)) estimate.clear(); }} />
            <DatasetPicker {...frame("datos")} datasets={form.activeSource?.datasets ?? []} selected={dataset}
                           onChoose={(key) => { if (form.chooseDataset(key)) estimate.clear(); }} />
            {form.hasFilters && (
              <FiltersPanel {...frame("filtros")} sensorBoxes={form.activeSource?.cajas ?? []}
                            boxes={form.boxes} onBoxesChange={form.setBoxes} types={form.types} onTypesChange={form.setTypes}
                            steps={form.hasStep ? (dataset?.pasos ?? []) : []} step={form.step} onStepChange={form.setStep} />
            )}
            <RangePanel {...frame("rango")} hasTime={hasTime} from={from} to={to} invalid={invalidRange}
                        coverageStart={form.coverageStart} coverageEnd={form.coverageEnd} lastReading={dataset?.hasta}
                        onFromChange={form.setFrom} onToChange={form.setTo} onPreset={form.applyPreset} />
            <FormatPicker {...frame("formato")} format={format} onChange={form.setFormat} maxMatRows={maxMat} />
            <ColumnPicker {...frame("columnas")} columns={columns} />
          </div>

          <aside className="dl-side">
            <div className="card dl-sum">
              <div className="dl-file mono" title={fileName}>{fileName}</div>
              <EstimatePanel estimate={estimate} rows={rows} sizeBytes={sizeBytes} exceedsMat={exceedsMat} />
              <DownloadControls download={download} format={format} ready={ready} onDownload={() => download.start(url, fileName)} />
              <ExportPreview preview={estimate.preview} />
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

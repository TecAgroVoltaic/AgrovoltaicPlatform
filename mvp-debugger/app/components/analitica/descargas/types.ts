// Forma del catálogo de exportación (`GET /api/historico/datos/exportables`) y
// de sus respuestas de estimación y vista previa. Los campos van en castellano
// porque son el contrato del servicio histórico.
import type { EXPORT_FORMATS } from "./constants";

export type ExportColumn = { nombre: string; tipo: string };

export type ExportDataset = {
  clave: string; fuente: string; titulo: string; descripcion: string; relacion: string;
  columna_tiempo: string | null; columnas: ExportColumn[]; filtros: string[];
  desde: string | null; hasta: string | null; via: string; pasos: number[];
};

export type SensorBox = { caja: string; sensor_tipo: string; sensores: number };

export type ExportSource = {
  clave: string; titulo: string; descripcion: string; disponible: boolean; motivo: string | null;
  datasets: ExportDataset[]; cajas?: SensorBox[];
};

export type ExportCatalog = { fuentes: ExportSource[]; max_filas_mat: number; zona_horaria: string; nota_horas: string };

export type ExportEstimate = { filas: number; primero: string | null; ultimo: string | null; cota?: boolean; sensores?: number };

export type ExportPreviewData = { columnas: string[]; filas: string[][] };

export type ExportFormat = (typeof EXPORT_FORMATS)[number]["k"];

export type StepId = "fuente" | "datos" | "filtros" | "rango" | "formato" | "columnas";

export type RangePresetId = "semana" | "mes" | "trimestre" | "anio" | "todo";

/** Una opción del selector con búsqueda: clave, rótulo y un dato al costado. */
export type PickerItem = { k: string; label: string; meta?: string };

/** Lo que cada paso del acordeón recibe para pintarse. */
export type StepFrame = { readonly number: number; readonly open: boolean; readonly onToggle: () => void };

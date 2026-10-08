// El `ChartSpec` que devuelve la tool `graficar` (contrato §1 de
// docs/referencia/contratos-asistente-alertas.md).
//
// `datos` es EXACTAMENTE el tipo de una de las seis primitivas: cada esquema se
// anota con ese tipo, así que si una primitiva cambia su forma, esto deja de
// compilar en vez de dejar pasar algo que la primitiva no sabe dibujar.
//
// Además de la forma se validan las relaciones internas (una barra por
// categoría, una celda dentro de la rejilla, una densidad por punto de x). Sin
// eso un spec "válido" se dibujaría a medias, que es peor que no dibujarlo.
//
// Cada esquema de `datos` vive en `chartSpec/`, uno por primitiva; acá queda
// la unión discriminada que los junta.
import { z } from "zod";

import { describeFirstIssue } from "@/app/lib/asistente/contracts/issues";

import { barsDataSchema } from "./chartSpec/bars";
import { boxPlotDataSchema } from "./chartSpec/boxPlot";
import { calendarHeatmapDataSchema } from "./chartSpec/calendarHeatmap";
import { ridgelineDataSchema } from "./chartSpec/ridgeline";
import { scatterFitDataSchema } from "./chartSpec/scatterFit";
import { timeSeriesDataSchema } from "./chartSpec/timeSeries";

export const CHART_SPEC_VERSION = 1;

const headerShape = {
  version: z.literal(CHART_SPEC_VERSION),
  titulo: z.string().min(1),
  subtitulo: z.string().optional(),
  unidad: z.string(),
};

export const chartSpecSchema = z.discriminatedUnion("tipo", [
  z.object({ ...headerShape, tipo: z.literal("serie"), datos: timeSeriesDataSchema }),
  z.object({ ...headerShape, tipo: z.literal("barras"), datos: barsDataSchema }),
  z.object({ ...headerShape, tipo: z.literal("cajas"), datos: boxPlotDataSchema }),
  z.object({ ...headerShape, tipo: z.literal("carpeta"), datos: calendarHeatmapDataSchema }),
  z.object({ ...headerShape, tipo: z.literal("dispersion"), datos: scatterFitDataSchema }),
  z.object({ ...headerShape, tipo: z.literal("crestas"), datos: ridgelineDataSchema }),
]);

export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartSpecKind = ChartSpec["tipo"];

export type ChartSpecParse =
  | { readonly ok: true; readonly spec: ChartSpec }
  | { readonly ok: false; readonly reason: string };

/** Valida un `_grafico` y, si no cumple, dice el primer motivo en castellano
 * con la ruta del campo, para que el error en pantalla sea accionable. */
export function parseChartSpec(raw: unknown): ChartSpecParse {
  const result = chartSpecSchema.safeParse(raw);
  if (result.success) return { ok: true, spec: result.data };
  return { ok: false, reason: describeFirstIssue(result.error) };
}

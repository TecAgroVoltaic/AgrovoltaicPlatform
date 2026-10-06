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
// Pasa de 150 líneas a propósito: son los seis esquemas espejo de las
// primitivas, y la unión discriminada los necesita juntos.
import { z } from "zod";

import { describeFirstIssue } from "@/app/lib/asistente/contracts/issues";

import type {
  BarsData,
  BoxPlotData,
  CalendarHeatmapData,
  RidgelineData,
  ScatterFitData,
  SeriesColorToken,
  TimeSeriesData,
} from "@/app/components/charts";

export const CHART_SPEC_VERSION = 1;

const COLOR_TOKENS = [
  "accent", "real", "pred", "ceil", "good", "warn", "crit",
] as const satisfies readonly SeriesColorToken[];

const colorSchema = z.enum(COLOR_TOKENS).optional();
const nullableNumber = z.number().nullable();

const timePointSchema = z.object({ timestamp: z.string(), value: nullableNumber });

const timeSeriesDataSchema: z.ZodType<TimeSeriesData> = z.object({
  lines: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      points: z.array(timePointSchema),
      color: colorSchema,
      trend: z.array(timePointSchema).optional(),
      movingAverage: z.array(timePointSchema).optional(),
      deviationBand: z
        .array(z.object({ timestamp: z.string(), lower: nullableNumber, upper: nullableNumber }))
        .optional(),
    }),
  ),
  unit: z.string(),
});

const barsDataSchema: z.ZodType<BarsData> = z
  .object({
    categories: z.array(z.string()),
    series: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        values: z.array(nullableNumber),
        color: colorSchema,
        valueLabels: z.array(z.string().nullable()).optional(),
      }),
    ),
    unit: z.string(),
    orientation: z.enum(["vertical", "horizontal"]).optional(),
  })
  .superRefine((data, ctx) => {
    data.series.forEach((serie, index) => {
      if (serie.values.length !== data.categories.length) {
        ctx.addIssue({
          code: "custom",
          path: ["series", index, "values"],
          message: `la serie «${serie.label}» trae ${serie.values.length} valores para ${data.categories.length} categorías`,
        });
      }
      if (serie.valueLabels && serie.valueLabels.length !== serie.values.length) {
        ctx.addIssue({
          code: "custom",
          path: ["series", index, "valueLabels"],
          message: `la serie «${serie.label}» trae etiquetas que no corresponden a sus valores`,
        });
      }
    });
  });

const boxPlotDataSchema: z.ZodType<BoxPlotData> = z.object({
  boxes: z.array(
    z.object({
      label: z.string(),
      min: z.number(),
      q1: z.number(),
      median: z.number(),
      q3: z.number(),
      max: z.number(),
      count: z.number().int().nonnegative(),
      outliers: z.array(z.number()).optional(),
    }),
  ),
  unit: z.string(),
  color: colorSchema,
});

const calendarHeatmapDataSchema: z.ZodType<CalendarHeatmapData> = z
  .object({
    columns: z.array(z.string()),
    rows: z.array(z.string()),
    cells: z.array(
      z.object({
        column: z.number().int().nonnegative(),
        row: z.number().int().nonnegative(),
        value: nullableNumber,
      }),
    ),
    unit: z.string(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    const outside = data.cells.findIndex(
      (cell) => cell.column >= data.columns.length || cell.row >= data.rows.length,
    );
    if (outside >= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["cells", outside],
        message: "hay celdas fuera de la rejilla de filas y columnas",
      });
    }
  });

const scatterFitDataSchema: z.ZodType<ScatterFitData> = z.object({
  points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() })),
  fit: z.object({ slope: z.number(), intercept: z.number(), r2: z.number() }).nullable(),
  xUnit: z.string(),
  yUnit: z.string(),
  color: colorSchema,
});

const ridgelineDataSchema: z.ZodType<RidgelineData> = z
  .object({
    curves: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        x: z.array(z.number()),
        density: z.array(z.number()),
        tailProbability: z.number().nullable().optional(),
        color: colorSchema,
      }),
    ),
    unit: z.string(),
    threshold: z.object({ value: z.number(), label: z.string() }).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    data.curves.forEach((curve, index) => {
      if (curve.x.length !== curve.density.length) {
        ctx.addIssue({
          code: "custom",
          path: ["curves", index, "density"],
          message: `la curva «${curve.label}» trae ${curve.density.length} densidades para ${curve.x.length} puntos`,
        });
      }
    });
  });

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

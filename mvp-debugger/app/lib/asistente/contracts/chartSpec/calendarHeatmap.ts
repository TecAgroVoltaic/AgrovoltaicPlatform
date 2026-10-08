// `datos` de tipo «carpeta»: espejo de `CalendarHeatmapData`, celdas dentro de la rejilla.
import { z } from "zod";

import type { CalendarHeatmapData } from "@/app/components/charts";

import { nullableNumber } from "./shared";

export const calendarHeatmapDataSchema: z.ZodType<CalendarHeatmapData> = z
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

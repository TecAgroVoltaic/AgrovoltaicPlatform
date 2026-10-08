// `datos` de tipo «barras»: espejo de `BarsData`, con una barra por categoría.
import { z } from "zod";

import type { BarsData } from "@/app/components/charts";

import { colorSchema, nullableNumber } from "./shared";

export const barsDataSchema: z.ZodType<BarsData> = z
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

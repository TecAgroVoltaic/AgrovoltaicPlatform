// `datos` de tipo «cajas»: espejo de `BoxPlotData`.
import { z } from "zod";

import type { BoxPlotData } from "@/app/components/charts";

import { colorSchema } from "./shared";

export const boxPlotDataSchema: z.ZodType<BoxPlotData> = z.object({
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

// `datos` de un `ChartSpec` de tipo «serie»: espejo de `TimeSeriesData`.
import { z } from "zod";

import type { TimeSeriesData } from "@/app/components/charts";

import { colorSchema, nullableNumber } from "./shared";

const timePointSchema = z.object({ timestamp: z.string(), value: nullableNumber });

export const timeSeriesDataSchema: z.ZodType<TimeSeriesData> = z.object({
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

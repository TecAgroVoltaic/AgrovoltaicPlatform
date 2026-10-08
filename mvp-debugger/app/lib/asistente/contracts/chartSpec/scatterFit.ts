// `datos` de tipo «dispersion»: espejo de `ScatterFitData`.
import { z } from "zod";

import type { ScatterFitData } from "@/app/components/charts";

import { colorSchema } from "./shared";

export const scatterFitDataSchema: z.ZodType<ScatterFitData> = z.object({
  points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() })),
  fit: z.object({ slope: z.number(), intercept: z.number(), r2: z.number() }).nullable(),
  xUnit: z.string(),
  yUnit: z.string(),
  color: colorSchema,
});

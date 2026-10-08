// `datos` de tipo «crestas»: espejo de `RidgelineData`, una densidad por punto de x.
import { z } from "zod";

import type { RidgelineData } from "@/app/components/charts";

import { colorSchema } from "./shared";

export const ridgelineDataSchema: z.ZodType<RidgelineData> = z
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

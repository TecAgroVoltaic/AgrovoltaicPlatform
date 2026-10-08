// Piezas comunes a los esquemas espejo de las primitivas de gráfico.
import { z } from "zod";

import type { SeriesColorToken } from "@/app/components/charts";

const COLOR_TOKENS = [
  "accent", "real", "pred", "ceil", "good", "warn", "crit",
] as const satisfies readonly SeriesColorToken[];

export const colorSchema = z.enum(COLOR_TOKENS).optional();
export const nullableNumber = z.number().nullable();

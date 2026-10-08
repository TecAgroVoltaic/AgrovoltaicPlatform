import { z } from "zod";

import { granularityFromWire, type Granularity } from "@/app/lib/analitica/granularity";

export const granularitySchema = z.string().transform((raw, ctx): Granularity => {
  const granularity = granularityFromWire(raw);
  if (!granularity) {
    ctx.addIssue({ code: "custom", message: `granularidad desconocida: ${raw}` });
    return z.NEVER;
  }
  return granularity;
});

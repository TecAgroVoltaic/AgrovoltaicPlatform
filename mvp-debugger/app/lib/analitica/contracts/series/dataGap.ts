import { z } from "zod";

/** Tramo del calendario sin una sola fila. Lo cuenta el backend. */
export type DataGap = { readonly from: string; readonly to: string; readonly days: number };

export const gapSchema = z
  .object({ desde: z.string(), hasta: z.string(), dias: z.number() })
  .transform((raw): DataGap => ({ from: raw.desde, to: raw.hasta, days: raw.dias }));

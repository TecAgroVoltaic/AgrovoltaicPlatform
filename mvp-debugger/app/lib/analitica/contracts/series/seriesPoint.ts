import { z } from "zod";

export type SeriesPoint = {
  readonly timestamp: string;
  readonly value: number | null;
  readonly bandLower: number | null;
  readonly bandUpper: number | null;
  readonly movingAverage: number | null;
  readonly trend: number | null;
};

export const pointSchema = z
  .object({
    t: z.string(),
    valor: z.number().nullable(),
    banda_inferior: z.number().nullable(),
    banda_superior: z.number().nullable(),
    media_movil: z.number().nullable(),
    tendencia: z.number().nullable(),
  })
  .transform((raw): SeriesPoint => ({
    timestamp: raw.t,
    value: raw.valor,
    bandLower: raw.banda_inferior,
    bandUpper: raw.banda_superior,
    movingAverage: raw.media_movil,
    trend: raw.tendencia,
  }));

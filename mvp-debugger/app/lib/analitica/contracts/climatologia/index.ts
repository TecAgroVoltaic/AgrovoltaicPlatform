// `GET /api/historico/analitica/climatologia?desde&hasta`: cuatro paneles por
// mes que comparten el eje `meses`. No usa el sobre `ventana`/`confianza` de las
// demás respuestas de análisis: trae su propio `periodo`.
import { z } from "zod";

import {
  boxesBlockSchema,
  irradiationBlockSchema,
} from "@/app/lib/analitica/contracts/climatologia/blocks";

export const climatologyResponseSchema = z
  .object({
    periodo: z.object({ desde: z.string(), hasta: z.string() }),
    meses: z.array(z.string()),
    irradiacion: irradiationBlockSchema,
    irradiancia: boxesBlockSchema,
    temperatura: boxesBlockSchema,
    humedad: boxesBlockSchema,
  })
  .transform((raw) => ({
    period: { from: raw.periodo.desde, toExclusive: raw.periodo.hasta },
    months: raw.meses,
    irradiation: raw.irradiacion,
    irradiance: raw.irradiancia,
    temperature: raw.temperatura,
    humidity: raw.humedad,
  }));

export type ClimatologyResponse = z.infer<typeof climatologyResponseSchema>;

export {
  CLIMATOLOGY_EMPTY_REASONS,
  type BoxesBlock,
  type ClimatologyBox,
  type ClimatologyEmptyReason,
  type IrradiationBlock,
} from "@/app/lib/analitica/contracts/climatologia/blocks";

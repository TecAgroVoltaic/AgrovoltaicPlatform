import { z } from "zod";

import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";
import { wholeDays, type ArrayKey } from "@/app/lib/analitica/contracts/comparativa/shared";

/** El cruce punto a punto de 5 min. El backend insiste en que NO es un PR. */
export type PointToPointCross = {
  readonly yieldByArray: Readonly<Record<ArrayKey, Metric>>;
  readonly readingsByArray: Readonly<Record<ArrayKey, number>>;
  readonly note: string;
};

const crossArraySchema = z.object({ kwh_por_kwh_m2: metricSchema, lecturas: wholeDays });

export const crossSchema = z
  .object({ inclinado: crossArraySchema, vertical: crossArraySchema, nota: z.string() })
  .transform((raw): PointToPointCross => ({
    yieldByArray: {
      inclinado: raw.inclinado.kwh_por_kwh_m2,
      vertical: raw.vertical.kwh_por_kwh_m2,
    },
    readingsByArray: { inclinado: raw.inclinado.lecturas, vertical: raw.vertical.lecturas },
    note: raw.nota,
  }));

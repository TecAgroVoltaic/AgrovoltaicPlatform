// Fig. 8 bis: matriz día x hora.
import { z } from "zod";

import { analysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema } from "@/app/lib/analitica/contracts/metric";
import { countSchema, nullableNumber, variableSchema } from "@/app/lib/analitica/contracts/estadistica/shared";

// `horas` son enteros 0..23 en hora LOCAL de Costa Rica, ya resuelta por el
// backend. La vista no convierte zona en ningún punto: hacerlo correría el
// mediodía solar seis horas.
export const folderResponseSchema = analysisResponse({
  variable: variableSchema,
  dias: z.array(z.string()),
  horas: z.array(z.number().int()),
  matriz: z.array(z.array(nullableNumber)),
  rango: z.object({ minimo: metricSchema, maximo: metricSchema }),
  celdas_con_dato: countSchema,
  celdas_totales: countSchema,
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: {
    variable: payload.variable,
    days: payload.dias,
    hours: payload.horas,
    matrix: payload.matriz,
    range: { minimum: payload.rango.minimo, maximum: payload.rango.maximo },
    cellsWithData: payload.celdas_con_dato,
    totalCells: payload.celdas_totales,
  },
}));

export type FolderResponse = z.infer<typeof folderResponseSchema>;

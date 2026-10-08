// Contrato de `GET /analitica/comparativa`: energía por arreglo, curva horaria y
// estacionalidad.
import { z } from "zod";

import { analysisResponse, type AnalysisWindow } from "@/app/lib/analitica/contracts/envelope";
import { totalsSchema, type ArrayTotals } from "@/app/lib/analitica/contracts/comparativa/arrayTotals";
import {
  crossSchema,
  type PointToPointCross,
} from "@/app/lib/analitica/contracts/comparativa/pointToPointCross";
import { seasonalitySchema, type Seasonality } from "@/app/lib/analitica/contracts/comparativa/seasonality";
import { byArray, nullableNumber, type ArrayKey } from "@/app/lib/analitica/contracts/comparativa/shared";

export type EnergyDifference = {
  readonly winner: ArrayKey | null;
  /** Frase ya redactada por el backend. Acá no se resta nada. */
  readonly reading: string;
};

export type HourlyPoint = {
  readonly hour: number;
  readonly tiltedW: number | null;
  readonly verticalW: number | null;
};

export type ArrayComparison = {
  readonly window: AnalysisWindow;
  readonly totals: Readonly<Record<ArrayKey, ArrayTotals>>;
  readonly difference: EnergyDifference;
  readonly hourly: readonly HourlyPoint[];
  /** Qué arreglo gana a cada hora, ya resuelto por el backend. */
  readonly hourlyReading: string;
  readonly cross: PointToPointCross;
  readonly seasonality: Seasonality;
};

export const arrayComparisonSchema = analysisResponse({
  totales: byArray(totalsSchema),
  diferencia: z.object({
    ganador: z.enum(["inclinado", "vertical"]).nullish(),
    lectura: z.string(),
  }),
  curva_horaria: z.array(
    z.object({
      hora: z.number().int(),
      inclinado_w: nullableNumber,
      vertical_w: nullableNumber,
    }),
  ),
  separacion_horaria: z.object({ lectura: z.string() }),
  emparejamiento_5min: crossSchema,
  estacionalidad: seasonalitySchema,
}).transform(({ window, payload }): ArrayComparison => ({
  window,
  totals: payload.totales,
  difference: {
    winner: payload.diferencia.ganador ?? null,
    reading: payload.diferencia.lectura,
  },
  hourly: payload.curva_horaria.map((point) => ({
    hour: point.hora,
    tiltedW: point.inclinado_w ?? null,
    verticalW: point.vertical_w ?? null,
  })),
  hourlyReading: payload.separacion_horaria.lectura,
  cross: payload.emparejamiento_5min,
  seasonality: payload.estacionalidad,
}));

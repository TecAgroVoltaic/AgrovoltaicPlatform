// El rango que se abre cuando nadie pidió ninguno, y los atajos del selector.
// Todo anclado al último día CON DATOS, no al reloj.
import type { CoverageBounds } from "@/app/lib/analitica/contracts/daysWithData";
import { addDays, type DateRange } from "@/app/lib/analitica/dateRange";

import { VERIFIED_COVERAGE } from "./verified";

const RECENT_WINDOW_DAYS = 30;
const WEEK_WINDOW_DAYS = 7;

function endingAtLastDataDay(days: number, coverage: CoverageBounds = VERIFIED_COVERAGE): DateRange {
  return {
    from: addDays(coverage.toExclusive, -days),
    toExclusive: coverage.toExclusive,
    granularity: "day",
  };
}

/** Lo que se abre cuando la URL no trae rango. */
export const DEFAULT_RANGE: DateRange = endingAtLastDataDay(RECENT_WINDOW_DAYS);

/** Atajos del selector. `build` es pura y sin reloj: se ancla a la cobertura
 *  que publica el backend (`GET /analitica/dias-con-datos`) cuando ya llegó, y
 *  a `VERIFIED_COVERAGE` mientras tanto o si no llegó. */
export type RangePreset = {
  readonly id: string;
  readonly label: string;
  readonly build: (coverage?: CoverageBounds) => DateRange;
};

export const RANGE_PRESETS: readonly RangePreset[] = [
  {
    id: "last-week",
    label: "Última semana con datos",
    build: (coverage) => endingAtLastDataDay(WEEK_WINDOW_DAYS, coverage),
  },
  {
    id: "last-month",
    label: "Último mes con datos",
    build: (coverage) => endingAtLastDataDay(RECENT_WINDOW_DAYS, coverage),
  },
  {
    id: "all",
    label: "Todo el histórico",
    build: (coverage = VERIFIED_COVERAGE) => ({
      from: coverage.from,
      toExclusive: coverage.toExclusive,
      granularity: "month",
    }),
  },
];

// De la respuesta de climatología a los estados de los cuatro paneles.
//
// No calcula: alinea las cajas con el eje `meses` que manda el backend (un mes
// sin caja queda como hueco, no se omite) y traduce el `motivo` de cada bloque
// a un vacío explicado.
import {
  emptyChart,
  readyChart,
  type BarsData,
  type BoxPlotBox,
  type BoxPlotData,
  type ChartState,
} from "@/app/components/charts";
import { pendingChartState } from "@/app/components/analitica/series/chartState";
import type { QueryState } from "@/app/components/analitica/series/useAnalyticsQuery";
import type {
  BoxesBlock,
  ClimatologyBox,
  ClimatologyEmptyReason,
  ClimatologyResponse,
} from "@/app/lib/analitica/contracts/climatologia";
import {
  EMPTY_REASON_TEXT,
  NO_MONTHS_MESSAGE,
  PANEL_TITLE,
  displayUnit,
} from "@/app/components/analitica/tablero/climatologia/labels";

const NO_BOX = { min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 } as const;

function emptyFor<TData>(reason: ClimatologyEmptyReason): ChartState<TData> {
  return emptyChart("NO_ROWS", EMPTY_REASON_TEXT[reason]);
}

function noMonths<TData>(): ChartState<TData> {
  return emptyChart("NO_ROWS", { message: NO_MONTHS_MESSAGE });
}

export function irradiationState(response: ClimatologyResponse): ChartState<BarsData> {
  const { months, irradiation } = response;
  if (irradiation.reason) return emptyFor(irradiation.reason);
  if (months.length === 0) return noMonths();
  return readyChart({
    categories: months,
    unit: displayUnit(irradiation.unit),
    series: [{ id: irradiation.variable, label: PANEL_TITLE.irradiation, values: irradiation.values }],
  });
}

export function boxesState(months: readonly string[], block: BoxesBlock): ChartState<BoxPlotData> {
  if (block.reason) return emptyFor(block.reason);
  if (months.length === 0) return noMonths();
  const byMonth = new Map(block.boxes.map((box) => [box.month, box]));
  return readyChart({
    unit: displayUnit(block.unit),
    boxes: months.map((month) => toBox(month, byMonth.get(month))),
  });
}

function toBox(month: string, box: ClimatologyBox | undefined): BoxPlotBox {
  if (!box || box.count === 0) return { label: month, ...NO_BOX };
  const { min, q1, median, q3, max } = box;
  if (min === null || q1 === null || median === null || q3 === null || max === null) {
    return { label: month, ...NO_BOX };
  }
  return { label: month, count: box.count, min, q1, median, q3, max };
}

export type ClimatologyPanels = {
  readonly irradiation: ChartState<BarsData>;
  readonly irradiance: ChartState<BoxPlotData>;
  readonly temperature: ChartState<BoxPlotData>;
  readonly humidity: ChartState<BoxPlotData>;
};

/** Mientras no hay respuesta los cuatro paneles comparten estado: es UNA consulta. */
export function climatologyPanels(query: QueryState<ClimatologyResponse>): ClimatologyPanels {
  if (query.status !== "loaded") {
    return {
      irradiation: pendingChartState(query),
      irradiance: pendingChartState(query),
      temperature: pendingChartState(query),
      humidity: pendingChartState(query),
    };
  }
  const { data } = query;
  return {
    irradiation: irradiationState(data),
    irradiance: boxesState(data.months, data.irradiance),
    temperature: boxesState(data.months, data.temperature),
    humidity: boxesState(data.months, data.humidity),
  };
}

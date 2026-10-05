"use client";
// Mapa de calor de carpeta: día del año contra hora del día (Fig. 8 bis).
import { ChartFrame, type ChartProps } from "@/app/components/charts/ChartFrame";
import { guardEmptiness } from "@/app/components/charts/state";
import {
  buildCalendarHeatmapOption,
  hasPlottableHeatmap,
  type CalendarHeatmapData,
} from "@/app/components/charts/options/calendarHeatmap";

export type CalendarHeatmapChartProps = ChartProps<CalendarHeatmapData>;

export function CalendarHeatmapChart(props: CalendarHeatmapChartProps) {
  return (
    <ChartFrame
      {...props}
      state={guardEmptiness(props.state, hasPlottableHeatmap)}
      buildOption={buildCalendarHeatmapOption}
    />
  );
}

// Barril de las primitivas de gráfico. Las vistas importan de acá y no de los
// archivos sueltos: si mañana una primitiva se parte en dos, no hay que tocar
// ninguna vista.
export { ChartFrame } from "@/app/components/charts/ChartFrame";
export type {
  ChartCaption,
  ChartFrameProps,
  ChartOptionBuilder,
  ChartProps,
} from "@/app/components/charts/ChartFrame";
export { MAX_CHART_HEIGHT, MIN_CHART_HEIGHT } from "@/app/components/charts/chartBox";
export { EChart } from "@/app/components/charts/EChart";
export type { ChartOption } from "@/app/components/charts/echarts";
export type { ChartCanvas } from "@/app/components/charts/options/canvas";
export * from "@/app/components/charts/state";
export type { ChartTheme, SeriesColorToken } from "@/app/components/charts/theme";
export { useChartTheme } from "@/app/components/charts/useChartTheme";

export { TimeSeriesChart } from "@/app/components/charts/TimeSeriesChart";
export type { TimeSeriesChartProps } from "@/app/components/charts/TimeSeriesChart";
export type {
  TimeSeriesBandPoint,
  TimeSeriesData,
  TimeSeriesLine,
  TimeSeriesPoint,
} from "@/app/components/charts/options/timeSeries";

export { BarsChart } from "@/app/components/charts/BarsChart";
export type { BarsChartProps } from "@/app/components/charts/BarsChart";
export type { BarSeries, BarsData } from "@/app/components/charts/options/bars";

export { BoxPlotChart } from "@/app/components/charts/BoxPlotChart";
export type { BoxPlotChartProps } from "@/app/components/charts/BoxPlotChart";
export type { BoxPlotBox, BoxPlotData } from "@/app/components/charts/options/boxPlot";

export { CalendarHeatmapChart } from "@/app/components/charts/CalendarHeatmapChart";
export type { CalendarHeatmapChartProps } from "@/app/components/charts/CalendarHeatmapChart";
export type { CalendarHeatmapData, HeatmapCell } from "@/app/components/charts/options/calendarHeatmap";

export { ScatterFitChart } from "@/app/components/charts/ScatterFitChart";
export type { ScatterFitChartProps } from "@/app/components/charts/ScatterFitChart";
export { describeFit } from "@/app/components/charts/options/scatterFit";
export type { LinearFit, ScatterFitData, ScatterPoint } from "@/app/components/charts/options/scatterFit";

export { RidgelineChart } from "@/app/components/charts/RidgelineChart";
export type { RidgelineChartProps } from "@/app/components/charts/RidgelineChart";
export type { DensityCurve, RidgelineData } from "@/app/components/charts/options/ridgeline";

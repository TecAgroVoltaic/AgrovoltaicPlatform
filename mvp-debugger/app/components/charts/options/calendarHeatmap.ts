// Mapa de calor "de carpeta": día del año en el eje X, hora del día en el Y.
//
// Es la vista que hace visible lo que una tabla esconde: los días sin ninguna
// fila quedan como huecos del color del panel, no como celdas en cero. Por eso
// una celda sin dato viaja con `value: null` y NO se pinta.
//
// La hora es hora local de Costa Rica tal como está guardada. No se convierte
// zona horaria en ningún punto (ver la nota de `useUTC` en options/base).
import { baseOption, categoryAxis, formatValue, tooltipBase } from "@/app/components/charts/options/base";
import type { ChartOption } from "@/app/components/charts/echarts";
import type { ChartTheme } from "@/app/components/charts/theme";

export type HeatmapCell = {
  /** Índice dentro de `columns`. */
  readonly column: number;
  /** Índice dentro de `rows`. */
  readonly row: number;
  readonly value: number | null;
};

export type CalendarHeatmapData = {
  /** Etiquetas del eje X, normalmente días (`2026-05-01`). */
  readonly columns: readonly string[];
  /** Etiquetas del eje Y, normalmente horas (`00`, `01`, …). */
  readonly rows: readonly string[];
  readonly cells: readonly HeatmapCell[];
  readonly unit: string;
  /** Extremos de la escala de color. Si faltan, se toman de los datos. */
  readonly min?: number;
  readonly max?: number;
};

/** La barra de color, MEDIDA COMO LA MIDE ECHARTS: en un `visualMap` horizontal
 * `itemHeight` es el LARGO de la barra e `itemWidth` su grosor, al revés de lo
 * que sugieren los nombres. Con el largo en 10 px los textos del mínimo y del
 * máximo salían uno encima del otro y encima de las fechas del eje. */
const VISUAL_MAP_BAR_LENGTH = 140;
const VISUAL_MAP_BAR_THICKNESS = 10;
/** Sitio bajo la rejilla para las fechas MÁS la escala de color, que va debajo.
 * Con los 40 px de antes quedaban a 1 px: no se pisaban por suerte, no por
 * diseño, y cualquier diferencia de fuente volvía a juntarlas. */
const GRID_BOTTOM_WITH_SCALE = 64;
const CELL_BORDER_WIDTH = 0.5;

export function hasPlottableHeatmap(data: CalendarHeatmapData): boolean {
  return data.cells.some((cell) => cell.value !== null);
}

export function buildCalendarHeatmapOption(
  data: CalendarHeatmapData,
  theme: ChartTheme,
): ChartOption {
  const values = data.cells
    .map((cell) => cell.value)
    .filter((value): value is number => value !== null);
  const min = data.min ?? Math.min(...values);
  const max = data.max ?? Math.max(...values);

  return {
    ...baseOption(theme),
    grid: { ...baseOption(theme).grid, bottom: GRID_BOTTOM_WITH_SCALE },
    tooltip: {
      ...tooltipBase(theme),
      trigger: "item",
      formatter: (params) => formatCellTooltip(params, data),
    },
    xAxis: { ...categoryAxis(theme, data.columns), splitArea: { show: false } },
    yAxis: { ...categoryAxis(theme, data.rows), splitArea: { show: false } },
    visualMap: {
      type: "continuous",
      min,
      max,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: VISUAL_MAP_BAR_THICKNESS,
      itemHeight: VISUAL_MAP_BAR_LENGTH,
      textStyle: { color: theme.muted },
      inRange: { color: [theme.line, theme.series.ceil, theme.series.accent] },
    },
    series: [
      {
        name: "medición",
        type: "heatmap",
        data: data.cells.map((cell) => [cell.column, cell.row, cell.value]),
        itemStyle: { borderColor: theme.panel, borderWidth: CELL_BORDER_WIDTH },
        progressive: data.cells.length,
      },
    ],
  };
}

function formatCellTooltip(params: unknown, data: CalendarHeatmapData): string {
  if (typeof params !== "object" || params === null || !("dataIndex" in params)) return "";
  const index = typeof params.dataIndex === "number" ? params.dataIndex : null;
  const cell = index === null ? undefined : data.cells[index];
  if (!cell) return "";
  const column = data.columns[cell.column] ?? "";
  const row = data.rows[cell.row] ?? "";
  return `${column} · ${row}<br/>${formatValue(cell.value, data.unit)}`;
}

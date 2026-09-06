// Box plots por categoría (distribución mensual de una variable).
//
// Los cinco números los calcula el backend. Una caja sin muestras se pinta como
// un hueco en el eje y no se omite: el eje tiene que seguir mostrando los meses
// que faltan, porque la ausencia es el hallazgo más grande de este histórico.
import { baseOption, categoryAxis, formatValue, tooltipBase, valueAxis } from "@/app/components/charts/options/base";
import { seriesColor, type ChartTheme, type SeriesColorToken } from "@/app/components/charts/theme";
import type { ChartOption } from "@/app/components/charts/echarts";

export type BoxPlotBox = {
  readonly label: string;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
  /** Muestras que resumen la caja. Con 0 no se dibuja nada. */
  readonly count: number;
  readonly outliers?: readonly number[];
};

export type BoxPlotData = {
  readonly boxes: readonly BoxPlotBox[];
  readonly unit: string;
  readonly color?: SeriesColorToken;
};

/** El "valor vacío" oficial de ECharts: se dibuja como nada, no como cero. */
const EMPTY_BOX = ["-", "-", "-", "-", "-"] as const;
const OUTLIER_SIZE = 4;
const OUTLIER_OPACITY = 0.55;

export function hasPlottableBoxes(data: BoxPlotData): boolean {
  return data.boxes.some((box) => box.count > 0);
}

export function buildBoxPlotOption(data: BoxPlotData, theme: ChartTheme): ChartOption {
  const color = seriesColor(theme, 0, data.color);
  const boxValues = data.boxes.map((box) =>
    box.count > 0 ? [box.min, box.q1, box.median, box.q3, box.max] : [...EMPTY_BOX],
  );
  const outliers = data.boxes.flatMap((box, index) =>
    (box.outliers ?? []).map((value) => [index, value]),
  );

  return {
    ...baseOption(theme),
    tooltip: {
      ...tooltipBase(theme),
      trigger: "item",
      formatter: (params) => formatBoxTooltip(params, data),
    },
    xAxis: categoryAxis(theme, data.boxes.map((box) => box.label)),
    yAxis: valueAxis(theme, data.unit),
    series: [
      {
        name: "distribución",
        type: "boxplot",
        data: boxValues,
        itemStyle: { color: theme.panel, borderColor: color },
      },
      {
        name: "atípicos",
        type: "scatter",
        symbolSize: OUTLIER_SIZE,
        itemStyle: { color, opacity: OUTLIER_OPACITY },
        data: outliers,
      },
    ],
  };
}

function formatBoxTooltip(params: unknown, data: BoxPlotData): string {
  const index = readDataIndex(params);
  const box = index === null ? undefined : data.boxes[index];
  if (!box) return "";
  if (box.count === 0) return `${box.label}: sin muestras`;
  const rows: [string, number][] = [
    ["máximo", box.max],
    ["Q3", box.q3],
    ["mediana", box.median],
    ["Q1", box.q1],
    ["mínimo", box.min],
  ];
  const body = rows.map(([name, value]) => `${name}: ${formatValue(value, data.unit)}`);
  return [`${box.label} (n = ${box.count})`, ...body].join("<br/>");
}

function readDataIndex(params: unknown): number | null {
  if (typeof params !== "object" || params === null) return null;
  const candidate = "dataIndex" in params ? params.dataIndex : null;
  return typeof candidate === "number" ? candidate : null;
}

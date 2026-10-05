"use client";
// Fig. 6 (panel superior): cómo se distribuye la variable en foco, mes a mes.
import { BoxPlotChart, type BoxPlotBox, type BoxPlotData } from "@/app/components/charts";
import type { DistributionResponse, MonthlyBox } from "@/app/lib/analitica/contracts/estadistica";
import { chartStateFrom } from "@/app/components/analitica/estadistica/chartState";
import { formatCount, formatDecimal } from "@/app/components/analitica/estadistica/format";
import type { FocusedFigureProps } from "@/app/components/analitica/estadistica/figures/props";

const IQR_DECIMALS = 1;

// Un mes sin cajas no se omite del eje: que falte marzo entero ES el hallazgo.
// La primitiva dibuja un hueco cuando `count` es 0 y ni mira los cinco números.
const NO_BOX = { min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 } as const;

/**
 * Los cinco números de cada mes, tal como vienen.
 *
 * Los extremos de la caja son los BIGOTES (el dato más extremo dentro de la
 * valla 1,5·IQR), no el mínimo y el máximo absolutos: con los absolutos, un mes
 * con un pico de piranómetro mezclado aplastaría la caja hasta no verse. Cuando
 * el mes no tiene vallas (una sola lectura) se cae a los extremos.
 */
export function toBoxPlotData(response: DistributionResponse): BoxPlotData {
  const { variable, boxes } = response.payload;
  return { unit: variable.unit, boxes: boxes.map(toBox) };
}

function toBox(box: MonthlyBox): BoxPlotBox {
  const min = box.lowerWhisker ?? box.minimum;
  const max = box.upperWhisker ?? box.maximum;
  const { q1, median, q3 } = box;
  if (box.count === 0 || min === null || q1 === null || median === null || q3 === null || max === null) {
    return { label: box.month, ...NO_BOX };
  }
  return { label: box.month, count: box.count, min, q1, median, q3, max };
}

function describeBoxes(response: DistributionResponse): string {
  const { boxes, iqrFactor } = response.payload;
  const withSamples = boxes.filter((box) => box.count > 0).length;
  return (
    `Atípico = fuera de ${formatDecimal(iqrFactor, IQR_DECIMALS)}·IQR; los bigotes llegan al ` +
    `dato más extremo dentro de la valla. ${formatCount(withSamples)} de ` +
    `${formatCount(boxes.length)} meses con muestras.`
  );
}

export function BoxesFigure(props: FocusedFigureProps<DistributionResponse>) {
  const { result, outOfCoverage, onRetry, focusLabel } = props;
  const state = chartStateFrom(result, { outOfCoverage, onRetry, adapt: toBoxPlotData });
  return (
    <BoxPlotChart
      title={`Distribución mensual · ${focusLabel}`}
      subtitle="Mediana, cuartiles y bigotes de cada mes del rango (Fig. 6)."
      caption={result?.ok ? describeBoxes(result.data) : undefined}
      state={state}
    />
  );
}

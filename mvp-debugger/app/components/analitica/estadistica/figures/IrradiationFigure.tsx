"use client";
// Fig. 6 (panel GHI): cuánta energía entró por metro cuadrado cada mes.
//
// Es una INTEGRAL, no un promedio: el backend pesa cada lectura por el salto
// real hasta la siguiente, porque la cadencia del piranómetro cambió de 15 s a
// 5 min según la época y promediarlas por igual subestima los meses densos.
import { BarsChart, type BarsData } from "@/app/components/charts";
import { formatMetric, isMeasured } from "@/app/lib/analitica/contracts/metric";
import type { IrradiationResponse } from "@/app/lib/analitica/contracts/estadistica";
import { chartStateFrom } from "@/app/components/analitica/estadistica/chartState";
import type { FigureProps } from "@/app/components/analitica/estadistica/figures/props";

const SERIES_ID = "irradiacion";
const SERIES_LABEL = "Irradiación acumulada";
// Dos decimales porque son los que el backend redondea: mostrar uno haría que la
// consola y el CLI dieran números distintos del mismo total.
const TOTAL_DECIMALS = 2;

export function toIrradiationBars(response: IrradiationResponse): BarsData {
  const { bars, total } = response.payload;
  return {
    categories: bars.map((bar) => bar.month),
    unit: total.unit,
    series: [
      {
        id: SERIES_ID,
        label: SERIES_LABEL,
        // Un mes sin integral va como null y NO como cero: una barra de altura
        // cero se lee como "ese mes no hubo sol", y lo que pasó es que no se midió.
        values: bars.map((bar) => (isMeasured(bar.irradiation) ? bar.irradiation.value : null)),
      },
    ],
  };
}

function describeTotal(response: IrradiationResponse): string {
  const { total } = response.payload;
  if (!isMeasured(total)) return `Sin total del rango: ${total.reason}.`;
  return (
    `Total del rango: ${formatMetric(total, TOTAL_DECIMALS)} ${total.unit}. ` +
    "Cada mes es la integral de la irradiancia a su cadencia real, no un promedio."
  );
}

export function IrradiationFigure({ result, outOfCoverage, onRetry }: FigureProps<IrradiationResponse>) {
  const state = chartStateFrom(result, { outOfCoverage, onRetry, adapt: toIrradiationBars });
  return (
    <BarsChart
      title="Irradiación mensual · incidente"
      subtitle="Energía que entró por metro cuadrado en cada mes del rango (Fig. 6)."
      caption={result?.ok ? describeTotal(result.data) : undefined}
      state={state}
    />
  );
}

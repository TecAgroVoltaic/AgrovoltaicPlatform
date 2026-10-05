"use client";
// La potencia media hora a hora: dónde gana cada arreglo dentro del día.
//
// Es la comprobación física de la comparación anual. El inclinado se lleva las
// horas centrales y el vertical recupera terreno en las puntas del día, que es
// lo que su geometría hace esperar. Qué arreglo aventaja en cada hora lo resuelve
// el backend y viaja redactado: acá no se resta una curva de la otra.
//
// Hora LOCAL de Costa Rica. Los timestamps ya vienen así y nadie convierte zona.
import { BarsChart, type BarsData } from "@/app/components/charts";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { ArrayComparison } from "@/app/lib/analitica/contracts/comparativa";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/comparativa/chartState";
import { toHourlyBars } from "@/app/components/analitica/comparativa/chartData";

export type HourlyFigureProps = {
  readonly result: AnalyticsResult<ArrayComparison> | null;
  readonly onRetry: () => void;
};

export function HourlyFigure({ result, onRetry }: HourlyFigureProps) {
  const state = chartStateFrom<ArrayComparison, BarsData>(result, {
    onRetry,
    adapt: (comparison) => toHourlyBars(comparison.hourly),
    emptiness: (comparison) =>
      comparison.hourly.length === 0
        ? emptyBecause("NO_ROWS", "no hay ni una hora con las dos potencias medidas.")
        : null,
  });

  return (
    <BarsChart
      title="Potencia media por hora del día"
      subtitle="Promedio de cada hora en todo el período, en hora local de Costa Rica."
      caption={result?.ok ? result.data.hourlyReading : undefined}
      state={state}
    />
  );
}

"use client";
// La energía de cada arreglo, mes a mes.
//
// Solo entran los meses que llegan al mínimo de cobertura que fija el backend:
// un mes con la mitad de los días produce la mitad de la energía, y ponerlo al
// lado de un mes completo haría ver una estacionalidad que no existe. Los meses
// que quedaron fuera se listan con su cobertura, porque un mes ausente sin
// explicación se lee como un mes sin sol.
import { BarsChart, type BarsData } from "@/app/components/charts";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { ArrayComparison, Seasonality } from "@/app/lib/analitica/contracts/comparativa";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/comparativa/chartState";
import { toMonthlyEnergyBars } from "@/app/components/analitica/comparativa/chartData";
import { formatFraction } from "@/app/components/analitica/comparativa/format";
import { describeDiscardReason } from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const NOT_ENOUGH_SEASONS =
  "no alcanza para hablar de estacionalidad: muy pocos meses llegan al mínimo de cobertura.";

export type MonthlyEnergyFigureProps = {
  readonly result: AnalyticsResult<ArrayComparison> | null;
  readonly onRetry: () => void;
};

export function MonthlyEnergyFigure({ result, onRetry }: MonthlyEnergyFigureProps) {
  const state = chartStateFrom<ArrayComparison, BarsData>(result, {
    onRetry,
    adapt: (comparison) => toMonthlyEnergyBars(comparison.seasonality.months),
    emptiness: (comparison) => emptinessOf(comparison.seasonality),
  });

  return (
    <div className={styles.figure}>
      <BarsChart
        title="Energía por mes y por arreglo"
        subtitle="Meses con cobertura suficiente para compararse entre sí."
        state={state}
      />
      {result?.ok ? <DiscardedMonths seasonality={result.data.seasonality} /> : null}
    </div>
  );
}

function emptinessOf(seasonality: Seasonality) {
  if (seasonality.months.length > 0) return null;
  return emptyBecause("FILTERED_OUT", seasonality.warning ?? NOT_ENOUGH_SEASONS);
}

function DiscardedMonths({ seasonality }: { readonly seasonality: Seasonality }) {
  if (seasonality.discarded.length === 0) return null;
  return (
    <p className="muted small">
      Fuera de la comparación por no llegar al {formatFraction(seasonality.minCoverage)} de
      cobertura:{" "}
      {seasonality.discarded.map((month, index) => (
        <span key={month.month}>
          {index > 0 ? ", " : ""}
          <span className="mono">{month.month}</span> ({formatFraction(month.coverage)},{" "}
          {describeDiscardReason(month.reason)})
        </span>
      ))}
      .
    </p>
  );
}

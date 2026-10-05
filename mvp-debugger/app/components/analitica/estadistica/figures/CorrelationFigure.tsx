"use client";
// Fig. 8: la nube de irradiancia contra la variable en foco, con su recta OLS.
//
// EL NÚMERO DE PARES NO ES UN ADORNO. Los pares se forman por timestamp EXACTO y
// las cadencias no coinciden (5 min lo eléctrico, 15 s la radiación), así que
// sobrevive una fracción de la muestra y no se reparte pareja entre los meses.
// Una nube densa y una nube sesgada se ven igual: por eso el pie publica cuántos
// pares sostienen la recta, contra cuántas lecturas tenía cada lado.
import { ScatterFitChart, describeFit, type ScatterFitData } from "@/app/components/charts";
import { isMeasured } from "@/app/lib/analitica/contracts/metric";
import type { CorrelationResponse } from "@/app/lib/analitica/contracts/estadistica";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/estadistica/chartState";
import { formatCount } from "@/app/components/analitica/estadistica/format";
import type { FocusedFigureProps } from "@/app/components/analitica/estadistica/figures/props";

// El código que manda el backend en `motivo` cuando la ventana no toca la
// variable. No es prosa: la prosa viaja en `nota`.
const OUT_OF_COVERAGE_CODE = "fuera_de_cobertura";
const NO_FIT_TEXT = "Sin recta: no hubo pares suficientes para ajustarla.";
const NO_PAIRS_TEXT = "No hubo ni un par con timestamp coincidente en el rango.";

export function toScatterData(response: CorrelationResponse): ScatterFitData {
  const { x, y, fit, points } = response.payload;
  const { slope, intercept, r2 } = fit;
  const fitted =
    isMeasured(slope) && isMeasured(intercept) && isMeasured(r2)
      ? { slope: slope.value, intercept: intercept.value, r2: r2.value }
      : null;
  return {
    points: points.map(([abscissa, ordinate]) => ({ x: abscissa, y: ordinate })),
    fit: fitted,
    xUnit: x.unit,
    yUnit: y.unit,
  };
}

/** La ecuación con su R², y de cuánta muestra salen. */
export function describeCorrelation(response: CorrelationResponse): string {
  const { pairs, xReadings, yReadings, drawnPoints, subsampled } = response.payload;
  const data = toScatterData(response);
  const equation = data.fit ? describeFit(data.fit, data.xUnit, data.yUnit) : NO_FIT_TEXT;
  const drawn = subsampled ? `; se dibujan ${formatCount(drawnPoints)}` : "";
  return (
    `${equation}. Ajustada sobre ${formatCount(pairs)} pares de timestamp exacto, ` +
    `de ${formatCount(xReadings)} lecturas en X y ${formatCount(yReadings)} en Y${drawn}.`
  );
}

function emptiness(response: CorrelationResponse) {
  const { pairs, fit, note } = response.payload;
  if (pairs > 0) return null;
  const outOfCoverage = !isMeasured(fit.slope) && fit.slope.reason === OUT_OF_COVERAGE_CODE;
  return emptyBecause(outOfCoverage ? "OUT_OF_COVERAGE" : "NO_ROWS", note ?? NO_PAIRS_TEXT);
}

export function CorrelationFigure(props: FocusedFigureProps<CorrelationResponse>) {
  const { result, outOfCoverage, onRetry, focusLabel } = props;
  const state = chartStateFrom(result, {
    outOfCoverage,
    onRetry,
    adapt: toScatterData,
    emptiness,
  });

  return (
    <ScatterFitChart
      title={`Irradiancia incidente contra ${focusLabel}`}
      subtitle="Cada punto es un instante en que las dos variables tienen la misma marca de tiempo (Fig. 8)."
      caption={result?.ok ? describeCorrelation(result.data) : undefined}
      state={state}
    />
  );
}

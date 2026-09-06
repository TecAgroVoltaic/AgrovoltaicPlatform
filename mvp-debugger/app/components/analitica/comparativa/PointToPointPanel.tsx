"use client";
// El cruce punto a punto de 5 minutos: el método que da vuelta el resultado.
//
// No es un Performance Ratio, y el backend lo dice en su propia nota. Se muestra
// igual porque es el que durante meses dio ganador al Vertical, y esconderlo
// sería quedarse con el resultado cómodo. Quién queda arriba y con qué muestra
// ya se lee arriba, en la tabla de métodos; acá están los dos cocientes con su
// unidad, que no es la del PR y por eso nunca comparten escala.
import { formatMetric, isMeasured } from "@/app/lib/analitica";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { ArrayComparison } from "@/app/lib/analitica/contracts/comparativa";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/comparativa/chartState";
import { StatePanel } from "@/app/components/analitica/comparativa/StatePanel";
import { formatCount } from "@/app/components/analitica/comparativa/format";
import {
  ARRAY_KEYS,
  ARRAY_LABEL,
  describeMissingReason,
} from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const CROSS_DECIMALS = 3;

export type PointToPointPanelProps = {
  readonly comparison: AnalyticsResult<ArrayComparison> | null;
  readonly onRetry: () => void;
};

export function PointToPointPanel({ comparison, onRetry }: PointToPointPanelProps) {
  const state = chartStateFrom<ArrayComparison, ArrayComparison>(comparison, {
    onRetry,
    adapt: (data) => data,
    emptiness: (data) =>
      ARRAY_KEYS.every((array) => !isMeasured(data.cross.yieldByArray[array]))
        ? emptyBecause("NO_ROWS", describeMissingReason(crossReason(data)))
        : null,
  });

  return (
    // Cuelga de la sección del método, que ya puso su h2.
    <StatePanel title="El cruce punto a punto" level={3} state={state}>
      {(data) => (
        <>
          <div className={styles.crossGrid}>
            {ARRAY_KEYS.map((array) => (
              <p key={array} className={styles.valueLine}>
                <span className="muted small">{ARRAY_LABEL[array]}</span>
                <span className={styles.value}>
                  {formatMetric(data.cross.yieldByArray[array], CROSS_DECIMALS)}
                  <small> kWh por kWh/m2</small>
                </span>
                <span className="muted small">
                  {formatCount(data.cross.readingsByArray[array])} lecturas emparejadas, de{" "}
                  {formatCount(data.totals[array].readings)} del período
                </span>
              </p>
            ))}
          </div>
          <p className="muted small">{data.cross.note}</p>
        </>
      )}
    </StatePanel>
  );
}

function crossReason(comparison: ArrayComparison): string | null {
  for (const array of ARRAY_KEYS) {
    const metric = comparison.cross.yieldByArray[array];
    if (!isMeasured(metric)) return metric.reason;
  }
  return null;
}

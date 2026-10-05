"use client";
// Lo que hay que saber en tres segundos: cuál de los dos arreglos produjo más
// por kWp instalado, y que ese resultado no sale del método elegido.
//
// El ganador, la diferencia y la frase que la explica vienen HECHOS del backend.
// Acá no se resta ni se divide nada: el mismo número tiene que dar igual en esta
// pantalla, en la tool del agente y en el CLI. Lo único que se deriva es cuántos
// métodos coinciden con ese ganador, y contar no es medir.
import { isMeasured } from "@/app/lib/analitica";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type {
  ArrayComparison,
  PerformanceReport,
} from "@/app/lib/analitica/contracts/comparativa";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/comparativa/chartState";
import { StatePanel } from "@/app/components/analitica/comparativa/StatePanel";
import { AgreementLine } from "@/app/components/analitica/comparativa/AgreementLine";
import { ArrayTotalsCard } from "@/app/components/analitica/comparativa/ArrayTotalsCard";
import { cutsOf, type Cut } from "@/app/components/analitica/comparativa/cuts";
import {
  ARRAY_KEYS,
  ARRAY_LABEL,
  describeMissingReason,
} from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

export type VerdictSectionProps = {
  readonly comparison: AnalyticsResult<ArrayComparison> | null;
  /** Los métodos del PR, que llegan de OTRO endpoint. Si esa consulta se cae, el
   *  veredicto se pinta igual y lo que falta es la línea de coincidencia. */
  readonly report: AnalyticsResult<PerformanceReport> | null;
  readonly onRetry: () => void;
};

function everyEnergyMissing(comparison: ArrayComparison): boolean {
  return ARRAY_KEYS.every((array) => !isMeasured(comparison.totals[array].energy));
}

function firstMissingReason(comparison: ArrayComparison): string {
  for (const array of ARRAY_KEYS) {
    const energy = comparison.totals[array].energy;
    if (!isMeasured(energy)) return describeMissingReason(energy.reason);
  }
  return describeMissingReason(null);
}

function cutsFrom(
  report: AnalyticsResult<PerformanceReport> | null,
  comparison: ArrayComparison,
): readonly Cut[] {
  return report?.ok ? cutsOf(report.data, comparison) : [];
}

export function VerdictSection({ comparison, report, onRetry }: VerdictSectionProps) {
  const state = chartStateFrom<ArrayComparison, ArrayComparison>(comparison, {
    onRetry,
    adapt: (data) => data,
    emptiness: (data) =>
      everyEnergyMissing(data)
        ? emptyBecause("NO_ROWS", firstMissingReason(data))
        : null,
  });

  return (
    <StatePanel title="Cuánto produjo cada arreglo" className={styles.hero} state={state}>
      {(data) => (
        <>
          <p className={styles.verdict}>
            {data.difference.winner ? (
              <>
                <span className={styles.winnerTag}>Produce más</span>
                <b>{ARRAY_LABEL[data.difference.winner]}</b>
              </>
            ) : (
              <span className={styles.winnerTag}>Sin comparación posible</span>
            )}
          </p>
          <p className={styles.verdictReading}>{data.difference.reading}</p>
          <AgreementLine winner={data.difference.winner} cuts={cutsFrom(report, data)} />
          <div className={styles.arrayGrid}>
            {ARRAY_KEYS.map((array) => (
              <ArrayTotalsCard
                key={array}
                array={array}
                energy={data.totals[array].energy}
                specificYield={data.totals[array].specificYield}
                readings={data.totals[array].readings}
                highlighted={data.difference.winner === array}
              />
            ))}
          </div>
        </>
      )}
    </StatePanel>
  );
}

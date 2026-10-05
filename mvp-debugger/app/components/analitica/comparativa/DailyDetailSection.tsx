"use client";
// El día a día, a pedido.
//
// El renglón diario (228 días) y el anexo de descartados pesan más de diez veces
// que el resto de la vista, así que no viajan en la carga inicial: se piden solo
// cuando alguien los va a mirar. La pantalla funciona entera sin ellos.
import { TimeSeriesChart, type TimeSeriesData } from "@/app/components/charts";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { PerformanceReport } from "@/app/lib/analitica/contracts/comparativa";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/comparativa/chartState";
import { StatePanel } from "@/app/components/analitica/comparativa/StatePanel";
import { toDailyPrSeries } from "@/app/components/analitica/comparativa/chartData";
import { DiscardedDaysTable } from "@/app/components/analitica/comparativa/DiscardedDaysTable";
import { formatDays } from "@/app/components/analitica/comparativa/format";
import { INPUT_LABEL, SOURCE_DESCRIPTION } from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

/** El camino que cubre todos los días válidos: el contador falta meses enteros
 *  y su serie diaria sería un peine de huecos. */
const DAILY_SOURCE = "integral" as const;
const SECTION_ID = "comparativa-dia-a-dia";

export type DailyDetailSectionProps = {
  /** null mientras nadie lo pidió o mientras está en vuelo. */
  readonly result: AnalyticsResult<PerformanceReport> | null;
  readonly requested: boolean;
  readonly onRequest: () => void;
  readonly onRetry: () => void;
};

export function DailyDetailSection({
  result,
  requested,
  onRequest,
  onRetry,
}: DailyDetailSectionProps) {
  return (
    <section className={styles.block} aria-labelledby={SECTION_ID}>
      <h2 id={SECTION_ID} className="gr-titulo">
        El día a día
      </h2>
      <p className="gr-sub">
        El PR de cada día y el anexo de los días descartados con su motivo.
      </p>
      {requested ? (
        <DailyDetail result={result} onRetry={onRetry} />
      ) : (
        <button className="btn ghost" type="button" onClick={onRequest}>
          Cargar el detalle diario
        </button>
      )}
    </section>
  );
}

function DailyDetail({
  result,
  onRetry,
}: Pick<DailyDetailSectionProps, "result" | "onRetry">) {
  const chartState = chartStateFrom<PerformanceReport, TimeSeriesData>(result, {
    onRetry,
    adapt: (report) => toDailyPrSeries(report.days ?? [], DAILY_SOURCE),
    emptiness: (report) =>
      report.days === null || report.days.length === 0
        ? emptyBecause("NO_ROWS", "el período no tiene ni un día con dato.")
        : null,
  });
  const panelState = chartStateFrom<PerformanceReport, PerformanceReport>(result, {
    onRetry,
    adapt: (report) => report,
    emptiness: (report) =>
      report.dayCounts.discarded === 0
        ? emptyBecause("NO_ROWS", "ningún día del período quedó fuera del cálculo.")
        : null,
  });

  return (
    <>
      <TimeSeriesChart
        title="Performance Ratio por día"
        subtitle={describeDailySeries(result)}
        caption="Los días descartados quedan como hueco: su PR existe en el dato pero el criterio ya lo rechazó, y dibujarlo sugeriría que se puede leer."
        state={chartState}
      />
      <StatePanel
        title="Días descartados"
        level={3}
        subtitle={describeCounts(result)}
        state={panelState}
      >
        {(report) => (
          <DiscardedDaysTable
            days={report.dayCounts.discardedDetail ?? []}
            criterion={report.criterion}
          />
        )}
      </StatePanel>
    </>
  );
}

function describeDailySeries(result: AnalyticsResult<PerformanceReport> | null): string {
  const base = `Energía del día por la ${SOURCE_DESCRIPTION[DAILY_SOURCE]}`;
  if (!result?.ok) return `${base}.`;
  return `${base}, contra ${INPUT_LABEL[result.data.dailyInput]}.`;
}

function describeCounts(result: AnalyticsResult<PerformanceReport> | null): string | undefined {
  if (!result?.ok) return undefined;
  const { withData, valid, discarded } = result.data.dayCounts;
  return `${formatDays(withData)} con dato, ${formatDays(valid)} válidos, ${formatDays(discarded)} fuera.`;
}

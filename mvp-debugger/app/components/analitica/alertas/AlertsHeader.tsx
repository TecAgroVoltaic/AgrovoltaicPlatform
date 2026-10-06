"use client";
// La cabecera propia de Alertas (52 px, `ownsHeader`): título, cuándo corrió el
// evaluador, el período de la lista y «Evaluar ahora».
//
// «Cuándo corrió» está siempre a la vista: sin eso, una lista vacía se lee como
// «todo sano» aunque el evaluador nunca haya corrido.
import type { ChartState } from "@/app/components/charts";
import { EvaluateButton } from "@/app/components/analitica/alertas/EvaluateButton";
import styles from "@/app/components/analitica/alertas/header.module.css";
import { useNow } from "@/app/components/analitica/alertas/useNow";
import type { EvaluationController } from "@/app/components/analitica/alertas/useEvaluation";
import { RangeChip } from "@/app/components/analitica/RangeChip";
import { SectionMenuButton } from "@/app/components/analitica/SectionMenuButton";
import { addDays } from "@/app/lib/analitica/dateRange";
import { dateSpanLabel } from "@/app/lib/analitica/rangeLabel";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import type { AlertsSummary } from "@/app/lib/alertas/contracts";
import { elapsedSince, momentoEnSitio } from "@/app/lib/tiempo";

/** «hace 2 h» no necesita más precisión que un minuto. */
const CLOCK_TICK_MS = 60_000;
const RANGE_TITLE = "Período de las alertas";
const RANGE_FORM_ID_PREFIX = "alertas-rango";
const RANGE_NOTE = "La lista muestra las alertas con algún día dentro de este período.";

function evaluatedLabel(summary: ChartState<AlertsSummary>, now: Date): string {
  if (summary.status === "loading") return "leyendo la última evaluación…";
  if (summary.status !== "ready") return "no se pudo saber cuándo se evaluaron";
  const { lastEvaluation } = summary.data;
  if (lastEvaluation === null) return "sin evaluar todavía";
  const evaluatedAt = new Date(lastEvaluation);
  if (Number.isNaN(evaluatedAt.getTime())) return `evaluadas el ${lastEvaluation}`;
  return `evaluadas ${elapsedSince(evaluatedAt, now)} · ${momentoEnSitio(evaluatedAt, now)}`;
}

export type AlertsHeaderProps = {
  readonly summary: ChartState<AlertsSummary>;
  readonly evaluation: EvaluationController;
};

export function AlertsHeader({ summary, evaluation }: AlertsHeaderProps) {
  const { range } = useDateRange();
  const now = useNow(CLOCK_TICK_MS);
  return (
    <header className={styles.header}>
      <SectionMenuButton className={styles.menu} />
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>Alertas</h1>
        <span className={styles.meta}>
          <span className={styles.metaRange}>
            {dateSpanLabel(range.from, addDays(range.toExclusive, -1), false)} ·{" "}
          </span>
          {evaluatedLabel(summary, now)}
        </span>
      </div>
      <RangeChip
        title={RANGE_TITLE}
        formIdPrefix={RANGE_FORM_ID_PREFIX}
        note={RANGE_NOTE}
        className={styles.context}
        chipClassName={styles.contextChip}
      />
      <EvaluateButton evaluation={evaluation} className={styles.evaluate} labelClassName={styles.evaluateLabel} />
    </header>
  );
}

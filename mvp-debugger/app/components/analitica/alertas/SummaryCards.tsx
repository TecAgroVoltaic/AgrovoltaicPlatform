// Las cuatro cifras de arriba. Salen TODAS de `GET /alertas/resumen`; la vista
// solo resta dos conteos que ya vienen (avisos = abiertas − graves). Lo que el
// resumen no publica (la próxima revisión más cercana, cuándo fue la última
// resuelta) no se deduce de la página visible: se omite.
//
// El resumen cuenta toda la tabla, no el período: por eso «Resueltas» no dice
// «en el período», y cada cifra lo aclara al pasar el puntero.
import type { ChartState } from "@/app/components/charts";
import { countLabel } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/overview.module.css";
import type { AlertsSummary } from "@/app/lib/alertas/contracts";

type Tone = "crit" | "warn" | "good";

type Card = { readonly label: string; readonly value: string; readonly tone?: Tone; readonly note?: string };

const WHOLE_TABLE_HINT = "Cuenta todas las alertas, no solo las del período.";
const LABELS = {
  critical: "Graves abiertas",
  warnings: "Avisos abiertos",
  tracking: "En seguimiento",
  resolved: "Resueltas",
} as const;
const LOADING_VALUE = "…";
const LOADING_CARDS: readonly Card[] = Object.values(LABELS).map((label) => ({ label, value: LOADING_VALUE }));

function cardsOf(summary: AlertsSummary): readonly Card[] {
  const { openCritical, openTotal, byStatus } = summary;
  const openWarnings = openTotal - openCritical;
  return [
    {
      label: LABELS.critical,
      value: String(openCritical),
      tone: openCritical > 0 ? "crit" : "good",
      note: byStatus.new > 0 ? `${countLabel(byStatus.new, "nueva", "nuevas")} sin ver en total` : undefined,
    },
    { label: LABELS.warnings, value: String(openWarnings), tone: openWarnings > 0 ? "warn" : "good" },
    { label: LABELS.tracking, value: String(byStatus.tracking) },
    { label: LABELS.resolved, value: String(byStatus.resolved), tone: byStatus.resolved > 0 ? "good" : undefined },
  ];
}

export function SummaryCards({ state }: { readonly state: ChartState<AlertsSummary> }) {
  if (state.status === "error" || state.status === "empty") {
    return (
      <p className={styles.cardsProblem} role="status">
        No se pudo leer el resumen de alertas.
        {state.status === "error" && state.onRetry ? (
          <button type="button" className={styles.retry} onClick={state.onRetry}>
            Reintentar
          </button>
        ) : null}
      </p>
    );
  }
  const loading = state.status === "loading";
  const cards = loading ? LOADING_CARDS : cardsOf(state.data);
  return (
    <dl className={styles.cards} aria-label="Resumen de alertas" aria-busy={loading}>
      {cards.map((card) => (
        <div key={card.label} className={styles.card} data-tone={card.tone} title={WHOLE_TABLE_HINT}>
          <dt className={styles.cardLabel}>{card.label}</dt>
          <dd className={styles.cardValue} data-tone={card.tone}>
            {card.value}
          </dd>
          {card.note ? <dd className={styles.cardNote}>{card.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

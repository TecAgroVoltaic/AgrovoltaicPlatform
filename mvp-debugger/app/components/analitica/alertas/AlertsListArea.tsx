"use client";
// Lo que ocupa el lugar de la lista: la lista con su paginación, o el estado
// que corresponda (cargando, el servicio falló, o cuál de los vacíos).
import type { ChartState } from "@/app/components/charts";
import { AlertList } from "@/app/components/analitica/alertas/AlertList";
import { AlertsPager } from "@/app/components/analitica/alertas/AlertsPager";
import {
  FilteredOutPanel,
  NeverEvaluatedPanel,
  NothingOpenPanel,
  PageOutOfRangePanel,
} from "@/app/components/analitica/alertas/EmptyPanels";
import { emptyListKind } from "@/app/components/analitica/alertas/emptyListKind";
import styles from "@/app/components/analitica/alertas/list.module.css";
import { ServiceErrorPanel } from "@/app/components/analitica/alertas/ServiceErrorPanel";
import statesStyles from "@/app/components/analitica/alertas/states.module.css";
import type { EvaluationController } from "@/app/components/analitica/alertas/useEvaluation";
import type { ResourceFailure } from "@/app/components/analitica/alertas/useReloadableResource";
import type { AlertsPage } from "@/app/lib/alertas/contracts";
import type { AlertsQuery } from "@/app/lib/alertas/query";

const LIST_REQUEST = "GET /alertas";
const FIRST_OFFSET = 0;

export type AlertsListAreaProps = {
  readonly id: string;
  readonly state: ChartState<AlertsPage>;
  readonly lastFailure: ResourceFailure | null;
  readonly query: AlertsQuery;
  /** `undefined` mientras el resumen no se conoce. */
  readonly lastEvaluation: string | null | undefined;
  readonly periodLabel: string;
  readonly evaluation: EvaluationController;
  readonly onSelect: (id: number, opener: HTMLElement) => void;
  readonly onGoTo: (offset: number) => void;
  readonly onClearFilters: () => void;
  readonly onShowClosed: () => void;
};

export function AlertsListArea(props: AlertsListAreaProps) {
  const { state, query } = props;
  return (
    <div id={props.id} className={styles.block} role="tabpanel" aria-label="Lista de alertas">
      {state.status === "loading" ? (
        <p className={statesStyles.loading} role="status">
          Cargando las alertas del período…
        </p>
      ) : state.status === "error" ? (
        <ServiceErrorPanel request={LIST_REQUEST} lastFailure={props.lastFailure} onRetry={state.onRetry} />
      ) : state.status === "empty" ? (
        <EmptyList {...props} />
      ) : (
        <>
          <AlertList alerts={state.data.alerts} selectedId={query.selectedId} onSelect={props.onSelect} />
          <AlertsPager page={state.data} onGoTo={props.onGoTo} />
        </>
      )}
    </div>
  );
}

function EmptyList({ query, lastEvaluation, periodLabel, evaluation, ...actions }: AlertsListAreaProps) {
  switch (emptyListKind(query, lastEvaluation)) {
    case "neverEvaluated":
      return <NeverEvaluatedPanel evaluation={evaluation} />;
    case "pageOutOfRange":
      return <PageOutOfRangePanel onFirstPage={() => actions.onGoTo(FIRST_OFFSET)} />;
    case "nothingOpen":
      return (
        <NothingOpenPanel
          periodLabel={periodLabel}
          lastEvaluation={lastEvaluation ?? undefined}
          onShowClosed={actions.onShowClosed}
        />
      );
    case "filteredOut":
      return <FilteredOutPanel onClear={actions.onClearFilters} />;
  }
}

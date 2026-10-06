// Carga, error y vacío de un bloque de la vista Alertas. A diferencia del de
// Calidad, el error ya trae su encabezado redactado (quién falló: el servicio
// que no respondió no es lo mismo que el que respondió mal) y el vacío puede
// ofrecer la salida que corresponde, como volver a la primera página.
import styles from "@/app/components/analitica/alertas/alertas.module.css";
import type { ChartState } from "@/app/components/charts";

export type ResourceStateProps = {
  /** Qué se está cargando, en minúsculas: «las alertas del rango». */
  readonly what: string;
  readonly state: ChartState<unknown>;
  readonly emptyAction?: { readonly label: string; readonly onClick: () => void };
};

export function ResourceState({ what, state, emptyAction }: ResourceStateProps) {
  if (state.status === "ready") return null;
  if (state.status === "loading") {
    return (
      <p className={`${styles.state} muted`} role="status">
        Cargando {what}…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className={styles.state} role="alert">
        <p>
          <b>{state.message}</b>
        </p>
        {state.onRetry ? (
          <button className="btn-sm" type="button" onClick={state.onRetry}>
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.state} role="status">
      <p>
        <b>{state.reason.message}</b>
      </p>
      {state.reason.hint ? <p className="muted small">{state.reason.hint}</p> : null}
      {emptyAction ? (
        <button className="btn-sm" type="button" onClick={emptyAction.onClick}>
          {emptyAction.label}
        </button>
      ) : null}
    </div>
  );
}

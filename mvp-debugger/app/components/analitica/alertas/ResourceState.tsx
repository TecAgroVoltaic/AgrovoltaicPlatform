// Carga y error de la ficha. El error ya trae su encabezado redactado (quién
// falló: el servicio que no respondió no es lo mismo que el que respondió mal).
import styles from "@/app/components/analitica/alertas/states.module.css";
import type { ChartState } from "@/app/components/charts";

export type ResourceStateProps = {
  /** Qué se está cargando, en minúsculas: «la ficha de la alerta». */
  readonly what: string;
  readonly state: ChartState<unknown>;
};

export function ResourceState({ what, state }: ResourceStateProps) {
  if (state.status === "ready") return null;
  if (state.status === "loading" || state.status === "empty") {
    return (
      <p className={styles.loading} role="status">
        {state.status === "loading" ? `Cargando ${what}…` : state.reason.message}
      </p>
    );
  }
  return (
    <div className={styles.inline} role="alert">
      <p>
        <b>{state.message}</b>
      </p>
      {state.onRetry ? (
        <button className={styles.ghost} type="button" onClick={state.onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

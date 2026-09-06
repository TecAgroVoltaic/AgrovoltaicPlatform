// Carga, error y vacío de un bloque de la vista, con las mismas reglas que el
// marco de los gráficos: el vacío SIEMPRE dice por qué, y el error solo ofrece
// reintentar cuando reintentar puede arreglar algo.
//
// Existe aparte de `ChartFrame` porque acá no hay lienzo que enmarcar: son
// tablas y tiras. Comparten el tipo `ChartState`, que es lo que importa.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import type { ChartState } from "@/app/components/charts";

export type SectionStateProps = {
  /** Qué se estaba cargando, en minúsculas: "los hallazgos del período". */
  readonly what: string;
  readonly state: ChartState<unknown>;
};

export function SectionState({ what, state }: SectionStateProps) {
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
          <b>No se pudieron cargar {what}</b>
        </p>
        <p className="muted small">{state.message}</p>
        {state.onRetry ? (
          <button className="btn-sm" type="button" onClick={state.onRetry}>
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.state}>
      <p>
        <b>Sin datos para este rango</b>
      </p>
      <p className="muted small">{state.reason.message}</p>
      {state.reason.hint ? <p className="muted small">{state.reason.hint}</p> : null}
    </div>
  );
}

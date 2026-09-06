"use client";
// La vista Descargas: elegir tabla, columnas y formato, y bajar el archivo.
//
// El formulario vive en un componente aparte porque necesita el catálogo YA
// resuelto: con las tablas en mano, «la primera» siempre existe y no hay que
// defender cada paso contra un catálogo a medias.
import { useExportRelations, type RelationsState } from "@/app/components/analitica/descargas/useExportRelations";
import { DownloadForm } from "@/app/components/analitica/descargas/DownloadForm";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import styles from "@/app/components/analitica/descargas/vista.module.css";

const WHAT = "las tablas exportables";

export function DescargasView() {
  const { range } = useDateRange();
  const { state } = useExportRelations();

  if (state.status !== "ready") return <CatalogState state={state} />;
  return <DownloadForm relations={state.data} range={range} />;
}

/** Los tres estados que no son `ready`. El tipo excluye `ready` en vez de
 *  confiar en quien llama: así el compilador obliga a tratar los tres y ninguno
 *  se puede colar sin pintar nada. El vacío SIEMPRE trae motivo, porque una
 *  pantalla sin formulario y sin explicación se lee como aplicación rota. */
function CatalogState({ state }: { readonly state: Exclude<RelationsState, { status: "ready" }> }) {
  if (state.status === "loading") {
    return (
      <p className="muted small" role="status">
        Cargando {WHAT}…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className={`card ${styles.estado}`} role="alert">
        <p>
          <b>No se pudieron cargar {WHAT}</b>
        </p>
        <p className="muted small">{state.message}</p>
        {state.onRetry ? (
          <button type="button" className="btn ghost" onClick={state.onRetry}>
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`card ${styles.estado}`}>
      <p>
        <b>No hay nada que descargar</b>
      </p>
      <p className="muted small">{state.reason.message}</p>
      {state.reason.hint ? <p className="muted small">{state.reason.hint}</p> : null}
    </div>
  );
}

// El tablero y sus cuatro estados.
//
// Los cuatro son obligatorios y ninguno es un borde raro en este producto: 295
// de 569 días del calendario no tienen ni una fila, así que el vacío es el caso
// común. `ChartState` obliga a que el vacío traiga MOTIVO, y por eso acá no hay
// forma de pintar una pantalla en blanco sin explicación.
//
// Es un componente de servidor: recibe el estado ya resuelto y no consulta nada.
// Así se puede probar los cuatro caminos sin red y sin `act()`.
import { DashboardSections } from "@/app/components/analitica/tablero/DashboardSections";
import { findSection } from "@/app/components/analitica/sections";
import type { DashboardState } from "@/app/components/analitica/tablero/loadDashboard";

const TABLERO_PATH = "/";

export function DashboardView({ state }: { readonly state: DashboardState }) {
  const section = findSection(TABLERO_PATH);
  return (
    <div className="vista">
      <header className="phead">
        <h1>{section?.label ?? "Tablero"}</h1>
        <p>{section?.description}</p>
      </header>
      <DashboardBody state={state} />
    </div>
  );
}

function DashboardBody({ state }: { readonly state: DashboardState }) {
  if (state.status === "loading") {
    return (
      <p className="loading muted" role="status">
        Cargando el tablero…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className="alert" role="alert">
        <strong>No se pudo cargar el tablero.</strong> {state.message}
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="pendiente" role="status">
        <h2>Sin datos para este rango</h2>
        <p>{state.reason.message}</p>
        {state.reason.hint ? <p className="muted small">{state.reason.hint}</p> : null}
      </div>
    );
  }

  return <DashboardSections summary={state.data} />;
}

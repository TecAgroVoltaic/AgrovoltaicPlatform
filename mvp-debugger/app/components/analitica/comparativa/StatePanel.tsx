"use client";
// Un bloque que NO es un gráfico (una tarjeta, una tabla) pero que necesita los
// mismos cuatro estados.
//
// Existe porque `ChartFrame` solo sirve para lienzos, y sin esto cada tarjeta
// resolvería el vacío a su manera: tarde o temprano una se quedaría en blanco
// sin decir por qué, que es justo lo que este producto no puede permitirse. El
// tipo `ChartState` obliga a traer el motivo, y los datos ni existen fuera del
// estado `ready`.
import type { ReactNode } from "react";

import type { ChartState } from "@/app/components/charts";

/** Nivel del encabezado. Un panel dentro de una sección que ya tiene su `h2`
 *  cuelga de ella con un `h3`: el esquema del documento es cómo se navega esta
 *  pantalla con lector de pantalla. */
export type HeadingLevel = 2 | 3;

export type StatePanelProps<TData> = {
  readonly title: string;
  readonly level?: HeadingLevel;
  readonly subtitle?: ReactNode;
  /** Para que una tarjeta pese más que otra: el veredicto no puede verse igual
   *  que la nota metodológica que lo acompaña. */
  readonly className?: string;
  readonly state: ChartState<TData>;
  /** Se llama SOLO con datos: no hay forma de pintar la tarjeta vacía. */
  readonly children: (data: TData) => ReactNode;
};

export function StatePanel<TData>({
  title,
  level = 2,
  subtitle,
  className,
  state,
  children,
}: StatePanelProps<TData>) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section className={className ? `card ${className}` : "card"} aria-label={title}>
      <Heading className="gr-titulo">{title}</Heading>
      {subtitle ? <p className="gr-sub">{subtitle}</p> : null}
      <PanelBody state={state}>{children}</PanelBody>
    </section>
  );
}

function PanelBody<TData>({
  state,
  children,
}: Pick<StatePanelProps<TData>, "state" | "children">) {
  if (state.status === "loading") {
    return (
      <p className="muted small" role="status">
        Cargando…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="gr-estado gr-error" role="alert">
        <p className="gr-estado-t">No se pudo cargar</p>
        <p className="muted small">{state.message}</p>
        {state.onRetry ? (
          <button className="btn-sm" type="button" onClick={state.onRetry}>
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="gr-estado gr-vacio">
        <p className="gr-estado-t">Sin datos para este rango</p>
        <p className="muted small">{state.reason.message}</p>
        {state.reason.hint ? <p className="muted small">{state.reason.hint}</p> : null}
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

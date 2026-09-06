"use client";
// El marco común de todos los gráficos: título, pie, y los cuatro estados.
//
// Vive acá y no en cada primitiva por dos razones. La primera es DRY. La segunda
// importa más: el estado VACÍO tiene que explicarse siempre, y si cada gráfico
// lo resolviera a su manera, tarde o temprano uno se quedaría en blanco sin
// decir por qué. Acá es imposible: el tipo `ChartState` exige el motivo.
import { useCallback, type ReactNode } from "react";

import { canvasStyle, stateStyle } from "@/app/components/charts/chartBox";
import { EChart } from "@/app/components/charts/EChart";
import { useChartTheme } from "@/app/components/charts/useChartTheme";
import type { ChartCanvas } from "@/app/components/charts/options/canvas";
import type { ChartOption } from "@/app/components/charts/echarts";
import type { ChartState } from "@/app/components/charts/state";
import type { ChartTheme } from "@/app/components/charts/theme";

/** El pie puede depender de los datos (la ecuación de un ajuste, cuántos puntos
 * entraron), así que también acepta una función. */
export type ChartCaption<TData> = ReactNode | ((data: TData) => ReactNode);

/** Construir la opción necesita saber cuánto mide el lienzo: hay decisiones que
 * se escriben en píxeles (cuánto puede medir un ítem de leyenda antes de
 * recortarse, cuánto el nombre de una fila antes de partirse) y a 286 px no son
 * las mismas que a 1.100. El ancho lo pone `EChart`, que es quien lo mide. */
export type ChartOptionBuilder<TData> = (
  data: TData,
  theme: ChartTheme,
  canvas: ChartCanvas,
) => ChartOption;

export type ChartFrameProps<TData> = {
  readonly title: string;
  /** Una línea bajo el título: qué se está mirando y con qué grano. */
  readonly subtitle?: string;
  readonly caption?: ChartCaption<TData>;
  /** Alto FIJO en píxeles. Solo para el gráfico cuyo alto lo manda su contenido
   *  y no su ancho: las 24 filas del mapa de calor, una fila por sensor en el de
   *  crestas. Sin esto el alto sale del ancho (ver `chartBox`). */
  readonly height?: number;
  readonly state: ChartState<TData>;
  readonly buildOption: ChartOptionBuilder<TData>;
};

/** Lo que recibe una primitiva: el marco menos el constructor de la opción, que
 * lo pone ella. Así una vista no puede pasarle una opción arbitraria y saltarse
 * el contrato del gráfico. */
export type ChartProps<TData> = Omit<ChartFrameProps<TData>, "buildOption">;

export function ChartFrame<TData>({
  title,
  subtitle,
  caption,
  height,
  state,
  buildOption,
}: ChartFrameProps<TData>) {
  const theme = useChartTheme();
  const captionNode = state.status === "ready" ? resolveCaption(caption, state.data) : null;

  return (
    // `minWidth: 0` acá y no en cada vista: una tarjeta de gráfico es casi
    // siempre un ítem de rejilla o de caja flexible, y el mínimo automático de
    // esos es el ancho MÍNIMO DE SU CONTENIDO. Con eso, un gráfico deja de
    // caber en su columna y en vez de encogerse la revienta, arrastrando a la
    // página entera. Ya obligó a dos vistas a defenderse por su cuenta con
    // `minmax(0, 1fr)`; el sitio donde se arregla para las cinco es este.
    <figure className="gr" style={{ minWidth: 0 }}>
      <figcaption className="gr-cab">
        <h3 className="gr-titulo">{title}</h3>
        {subtitle ? <p className="gr-sub">{subtitle}</p> : null}
      </figcaption>
      <Body title={title} height={height} state={state} theme={theme} buildOption={buildOption} />
      {captionNode ? <p className="gr-pie">{captionNode}</p> : null}
    </figure>
  );
}

function resolveCaption<TData>(caption: ChartCaption<TData>, data: TData): ReactNode {
  return typeof caption === "function" ? caption(data) : caption;
}

type BodyProps<TData> = Pick<ChartFrameProps<TData>, "title" | "state" | "buildOption"> & {
  readonly height: number | undefined;
  readonly theme: ChartTheme | null;
};

function Body<TData>({ title, height, state, theme, buildOption }: BodyProps<TData>) {
  // Sin tema todavía no hay colores que usar: es el mismo "aún no" que la carga.
  if (state.status === "loading" || theme === null) {
    return (
      <div className="gr-estado" style={stateStyle(height)} role="status">
        <span className="muted">Cargando {title.toLowerCase()}…</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="gr-estado gr-error" style={stateStyle(height)} role="alert">
        <p className="gr-estado-t">No se pudo cargar el gráfico</p>
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
      <div className="gr-estado gr-vacio" style={stateStyle(height)}>
        <p className="gr-estado-t">Sin datos para este rango</p>
        <p className="muted small">{state.reason.message}</p>
        {state.reason.hint ? <p className="muted small">{state.reason.hint}</p> : null}
      </div>
    );
  }
  return (
    <Canvas
      title={title}
      height={height}
      data={state.data}
      theme={theme}
      buildOption={buildOption}
    />
  );
}

type CanvasProps<TData> = {
  readonly title: string;
  readonly height: number | undefined;
  readonly data: TData;
  readonly theme: ChartTheme;
  readonly buildOption: ChartOptionBuilder<TData>;
};

/** Componente propio y no una rama de `Body` para poder cerrar el constructor
 * sobre unos datos que EXISTEN: acá `data` ya es del tipo, sin ningún casteo. */
function Canvas<TData>({ title, height, data, theme, buildOption }: CanvasProps<TData>) {
  const build = useCallback(
    (canvas: ChartCanvas) => buildOption(data, theme, canvas),
    [buildOption, data, theme],
  );
  return <EChart buildOption={build} boxStyle={canvasStyle(height)} ariaLabel={title} />;
}

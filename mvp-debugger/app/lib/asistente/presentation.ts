// Los rótulos que la vista del Asistente deriva de los datos que ya tiene: el
// costo de un hilo, el resumen de los pasos de una respuesta, cuánto tardó cada
// tool en vivo, cuántos elementos dibuja un gráfico y el rango en corto.
//
// Funciones puras y sin React: el texto exacto que ve la persona se prueba acá,
// y los componentes solo lo pintan.
import { addDays, type DateRange } from "@/app/lib/analitica/dateRange";
import { GRANULARITY_LABEL } from "@/app/lib/analitica/granularity";
import type { AgentStep } from "@/app/lib/asistente/contracts/chatEvents";
import type { ChartSpec } from "@/app/lib/asistente/contracts/chartSpec";
import type { Thread } from "@/app/lib/asistente/threads";
import type { LiveStep } from "@/app/lib/asistente/turnReducer";
import { fechaCorta } from "@/app/lib/tiempo";

const LOCALE = "es-CR";
const MS_PER_SECOND = 1000;
const USD_DECIMALS = 3;
const YEAR_LENGTH = 4;
const MONTH_LENGTH = 7;

const usdFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: USD_DECIMALS,
  maximumFractionDigits: USD_DECIMALS,
});
const secondsFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function messageCountLabel(count: number): string {
  return plural(count, "mensaje", "mensajes");
}

/** Lo que costó el hilo entero: la suma de `costo.usd_total` de cada respuesta.
 *  `null` si ninguna trae costo, para no mostrar un «USD 0,000» que no se midió. */
export function threadCostUsd(thread: Thread): number | null {
  const costs = thread.messages.flatMap((message) => {
    const cost = message.rol === "assistant" ? message.traza?.costo?.usd_total : undefined;
    return cost === undefined ? [] : [cost];
  });
  return costs.length === 0 ? null : costs.reduce((total, cost) => total + cost, 0);
}

export function formatUsd(amount: number): string {
  return `USD ${usdFormat.format(amount)}`;
}

export function formatSeconds(milliseconds: number): string {
  return `${secondsFormat.format(milliseconds / MS_PER_SECOND)} s`;
}

/** «2 consultas · 0,9 s»: la línea plegada de los pasos de una respuesta. El
 *  tiempo es el total del turno; sin él, la suma de lo que tardaron las tools. */
export function stepsSummary(steps: readonly AgentStep[], totalMs: number | undefined): string {
  const tools = steps.filter((step) => step.tipo === "tool");
  const queries = tools.length === 0 ? "sin consultas" : plural(tools.length, "consulta", "consultas");
  const toolMs = tools.reduce((total, step) => total + (step.tipo === "tool" ? (step.ms ?? 0) : 0), 0);
  const elapsed = totalMs ?? (toolMs > 0 ? toolMs : undefined);
  return elapsed === undefined ? queries : `${queries} · ${formatSeconds(elapsed)}`;
}

/**
 * Cuánto tardó cada tool ya cerrada de la lista en vivo, por id. El paso cerrado
 * no trae el id de su `tool_inicio`: se empareja la n-ésima tool cerrada de un
 * nombre con el n-ésimo paso de ese nombre, que es el mismo criterio con que el
 * reductor las marca como terminadas.
 */
export function liveStepDurations(
  liveSteps: readonly LiveStep[],
  steps: readonly AgentStep[],
): ReadonlyMap<string, number> {
  const msByTool = new Map<string, number[]>();
  for (const step of steps) {
    if (step.tipo !== "tool" || step.ms === undefined) continue;
    msByTool.set(step.nombre, [...(msByTool.get(step.nombre) ?? []), step.ms]);
  }
  const durations = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const live of liveSteps) {
    if (live.status === "running") continue;
    const position = seen.get(live.toolName) ?? 0;
    seen.set(live.toolName, position + 1);
    const ms = msByTool.get(live.toolName)?.[position];
    if (ms !== undefined) durations.set(live.id, ms);
  }
  return durations;
}

/** «7 puntos», «12 celdas»: cuánto dibuja un gráfico, con el nombre de lo que cuenta. */
export function chartSizeLabel(spec: ChartSpec): string {
  switch (spec.tipo) {
    case "serie":
      return plural(spec.datos.lines.reduce((total, line) => total + line.points.length, 0), "punto", "puntos");
    case "barras":
      return plural(spec.datos.categories.length, "barra", "barras");
    case "cajas":
      return plural(spec.datos.boxes.length, "caja", "cajas");
    case "carpeta":
      return plural(spec.datos.cells.length, "celda", "celdas");
    case "dispersion":
      return plural(spec.datos.points.length, "punto", "puntos");
    case "crestas":
      return plural(spec.datos.curves.length, "curva", "curvas");
  }
}

/** «3 may – 1 jun 2026 · diaria». El fin se muestra INCLUSIVO, como lo lee una
 *  persona, y el año va una sola vez si las dos puntas lo comparten. */
export function rangeLabel(range: DateRange): string {
  const lastDay = addDays(range.toExclusive, -1);
  const sameYear = range.from.slice(0, YEAR_LENGTH) === lastDay.slice(0, YEAR_LENGTH);
  const sameMonth = range.from.slice(0, MONTH_LENGTH) === lastDay.slice(0, MONTH_LENGTH);
  const end = fechaCorta(lastDay, true);
  const dates =
    range.from === lastDay
      ? end
      : sameMonth
        ? `${Number(range.from.slice(-2))} – ${end}`
        : `${fechaCorta(range.from, !sameYear)} – ${end}`;
  return `${dates} · ${GRANULARITY_LABEL[range.granularity]}`;
}

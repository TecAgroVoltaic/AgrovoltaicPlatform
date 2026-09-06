// Qué parte del rango elegido cubre de verdad la tabla, y de qué tamaño es la
// descarga que se está por pedir.
//
// SOBRE LA REGLA "el navegador NO calcula": esta estimación no es un número de
// análisis. No se compara con nada, no sale en un informe y no tiene que
// coincidir con la consola ni con el CLI. Es un aviso de MAGNITUD, para que
// nadie pida noventa mil filas sin saberlo, y por eso se muestra siempre como
// aproximación. El conteo exacto lo trae el archivo, que lo genera el backend.
import {
  addDays,
  daysBetween,
  formatRange,
  type DateRange,
  type IsoDate,
} from "@/app/lib/analitica/dateRange";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

/** A partir de acá conviene avisar de que el archivo va a ser grande. */
export const LARGE_DOWNLOAD_ROWS = 50_000;

type Window = Pick<DateRange, "from" | "toExclusive">;

export type RelationScope =
  /** El rango entra completo en la cobertura. */
  | { readonly kind: "covered"; readonly estimatedRows: number }
  /** Se solapan a medias: el archivo trae menos días de los pedidos. */
  | { readonly kind: "clipped"; readonly estimatedRows: number; readonly notice: string }
  /** No se solapan: el archivo saldría vacío. */
  | { readonly kind: "outside"; readonly notice: string }
  /** La tabla no se recorta por fecha (no tiene eje temporal, o no lo publica). */
  | { readonly kind: "whole"; readonly rows: number; readonly notice: string };

const NO_TIME_COLUMN_NOTICE =
  "Esta tabla no tiene columna de tiempo: el rango no la recorta y se descarga entera.";
const NO_WINDOW_NOTICE =
  "El servicio no publicó desde cuándo hay dato en esta tabla: el rango no se puede contrastar.";

/** Ventana [desde, hasta) de la tabla. El `hasta` del backend es el último día
 *  CON dato, inclusive, y el de la aplicación es exclusivo: ese +1 es lo que
 *  decide si el último día se descarga o se pierde. */
export function relationWindow(relation: ExportRelation): Window | null {
  if (!relation.from || !relation.until) return null;
  return { from: relation.from, toExclusive: addDays(relation.until, 1) };
}

/** La cobertura de la tabla en una línea, para el listado. */
export function relationWindowLabel(relation: ExportRelation): string {
  const window = relationWindow(relation);
  return window ? describe(window) : "sin eje temporal";
}

export function relationScope(relation: ExportRelation, range: DateRange): RelationScope {
  const window = relationWindow(relation);
  if (!window) {
    return {
      kind: "whole",
      rows: relation.rows,
      notice: relation.timeColumn ? NO_WINDOW_NOTICE : NO_TIME_COLUMN_NOTICE,
    };
  }

  const from = later(range.from, window.from);
  const toExclusive = earlier(range.toExclusive, window.toExclusive);
  if (daysBetween(from, toExclusive) <= 0) {
    return { kind: "outside", notice: outsideNotice(relation, window, range) };
  }

  const estimatedRows = estimateRows(relation.rows, window, { from, toExclusive });
  if (from === range.from && toExclusive === range.toExclusive) {
    return { kind: "covered", estimatedRows };
  }
  return {
    kind: "clipped",
    estimatedRows,
    notice:
      `El rango se sale de la cobertura de «${relation.label}» (${describe(window)}): ` +
      `el archivo solo va a traer del ${from} al ${addDays(toExclusive, -1)}.`,
  };
}

/** Filas del recorte, repartiendo las de la tabla entera entre sus días. Es una
 *  densidad media: en un histórico con huecos, el número real será menor. */
function estimateRows(rows: number, window: Window, overlap: Window): number {
  const coverageDays = daysBetween(window.from, window.toExclusive);
  if (coverageDays <= 0) return 0;
  const overlapDays = daysBetween(overlap.from, overlap.toExclusive);
  return Math.round((rows * overlapDays) / coverageDays);
}

function outsideNotice(relation: ExportRelation, window: Window, range: DateRange): string {
  return (
    `«${relation.label}» solo tiene dato ${describe(window)}, y el rango pedido es ` +
    `${formatRange(range)}: el archivo saldría vacío.`
  );
}

function describe(window: Window): string {
  return `del ${window.from} al ${addDays(window.toExclusive, -1)}`;
}

function later(first: IsoDate, second: IsoDate): IsoDate {
  return first > second ? first : second;
}

function earlier(first: IsoDate, second: IsoDate): IsoDate {
  return first < second ? first : second;
}

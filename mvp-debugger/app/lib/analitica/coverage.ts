// Hasta dónde llegan los datos, y qué rango se abre cuando nadie pidió ninguno.
//
// EL PUNTO: el sistema PV dejó de reportar el 2026-06-01. Un rango por defecto
// de "últimos 30 días contra hoy" abriría la aplicación siempre vacía, y los
// "últimos 7 días" del tablero saldrían todos en cero. Por eso todo se ancla al
// último día CON DATOS, no al reloj.
//
// La cobertura de CADA VARIABLE ya no se escribe a mano: la publica
// `GET /analitica/variables` y se pregunta acá abajo (`variableCoverage`). Eran
// dos tablas copiadas en dos vistas, y dos copias de la misma verdad se separan
// solas. Quien BAJA ese catálogo es `variableCatalog.ts`: esto es conocimiento y
// aquello es transporte, y juntarlos metía un `fetch` en un módulo que importan
// hasta los componentes de cliente que solo quieren el rango por defecto.
//
// DEUDA CONOCIDA: la cobertura de la BASE (la de acá abajo) sigue a mano porque
// ningún endpoint la publica. Verificada contra la Supabase de producción el
// 2026-08-28. Cuando el backend la exponga, se reemplaza ACÁ y nada más cambia.
import type { CatalogVariable } from "@/app/lib/analitica/contracts/variables";
import {
  addDays,
  formatRange,
  rangesOverlap,
  type DateRange,
} from "@/app/lib/analitica/dateRange";

/** Ventana [from, toExclusive) que la base de datos cubre de verdad. */
export const VERIFIED_COVERAGE = {
  from: "2024-11-10",
  toExclusive: "2026-06-02",
} as const;

/** Días de calendario que la cobertura abarca, y cuántos traen datos. */
export const COVERAGE_FACTS = {
  daysWithData: 274,
  calendarDays: 569,
} as const;

const RECENT_WINDOW_DAYS = 30;
const WEEK_WINDOW_DAYS = 7;

function endingAtLastDataDay(days: number): DateRange {
  return {
    from: addDays(VERIFIED_COVERAGE.toExclusive, -days),
    toExclusive: VERIFIED_COVERAGE.toExclusive,
    granularity: "day",
  };
}

/** Lo que se abre cuando la URL no trae rango. */
export const DEFAULT_RANGE: DateRange = endingAtLastDataDay(RECENT_WINDOW_DAYS);

/** Atajos del selector. `build` es pura: mismo resultado siempre, sin reloj. */
export type RangePreset = {
  readonly id: string;
  readonly label: string;
  readonly build: () => DateRange;
};

export const RANGE_PRESETS: readonly RangePreset[] = [
  {
    id: "last-week",
    label: "Última semana con datos",
    build: () => endingAtLastDataDay(WEEK_WINDOW_DAYS),
  },
  {
    id: "last-month",
    label: "Último mes con datos",
    build: () => endingAtLastDataDay(RECENT_WINDOW_DAYS),
  },
  {
    id: "all",
    label: "Todo el histórico",
    build: () => ({ ...VERIFIED_COVERAGE, granularity: "month" }),
  },
];

/** Último día que SÍ trae datos (el fin exclusivo menos uno). */
export const LAST_DAY_WITH_DATA = addDays(VERIFIED_COVERAGE.toExclusive, -1);

/** Aviso para un rango que la base no cubre: es la causa más común de un gráfico
 * vacío, y merece decirse antes de que la persona crea que algo se rompió. */
export const OUT_OF_COVERAGE_NOTICE =
  `Fuera de la cobertura de la base: los datos van del ${VERIFIED_COVERAGE.from} ` +
  `al ${LAST_DAY_WITH_DATA} (el sistema dejó de reportar ese día).`;

/** Ventana [from, toExclusive) en que la variable EXISTE, acotada por la base.
 *  `until` es el último día CON dato, INCLUSIVO, y acá el fin es exclusivo: ese
 *  +1 es lo que decide si los dieciocho días del SP722 se ven o se pierden. */
export function variableWindow(variable: CatalogVariable): Pick<DateRange, "from" | "toExclusive"> {
  return {
    from: variable.from ?? VERIFIED_COVERAGE.from,
    toExclusive: variable.until ? addDays(variable.until, 1) : VERIFIED_COVERAGE.toExclusive,
  };
}

/** La ventana en prosa: «desde el X», «hasta el X» o «entre el X y el Y». */
export function describeVariableWindow(variable: CatalogVariable): string | null {
  if (variable.from && variable.until) return `entre el ${variable.from} y el ${variable.until}`;
  if (variable.from) return `desde el ${variable.from}`;
  if (variable.until) return `hasta el ${variable.until}`;
  return null;
}

export type CoverageGapCode = "NO_SOURCE" | "OUT_OF_COVERAGE";

/** Por qué la variable y el rango no coexisten. `message` ya está redactado. */
export type CoverageGap = {
  readonly code: CoverageGapCode;
  readonly message: string;
};

export type VariableCoverage = {
  /** `null` = se solapan, y entonces tiene sentido consultar. */
  readonly gap: CoverageGap | null;
  /** El agujero INTERIOR que ya contó el backend. Se lee SIEMPRE, también con
   *  `gap` en null: una curva que se ve entera no delata que `energia_pv1_wh`
   *  cubre 144 días y ninguno entre noviembre 2025 y febrero 2026, y un par de
   *  fechas no puede expresar ese hueco. */
  readonly innerGap: string | null;
};

/**
 * Si la variable y el rango se solapan, y por qué no cuando no lo hacen.
 *
 * `plottable` corta PRIMERO: una variable sin fuente no se arregla moviendo el
 * rango, y disfrazarla de problema de cobertura manda a la persona a probar
 * períodos que nunca van a traer nada.
 */
export function variableCoverage(variable: CatalogVariable, range: DateRange): VariableCoverage {
  return { gap: coverageGapOf(variable, range), innerGap: variable.innerGap };
}

function coverageGapOf(variable: CatalogVariable, range: DateRange): CoverageGap | null {
  if (!variable.plottable) {
    // La prosa del backend viaja TAL CUAL: es la que nombra el sensor que falta.
    const why = variable.missingSource ?? "el servicio no la acepta como serie";
    return { code: "NO_SOURCE", message: `«${variable.label}»: ${why}.` };
  }
  if (rangesOverlap(range, variableWindow(variable))) return null;
  const window = describeVariableWindow(variable);
  if (!window) return { code: "OUT_OF_COVERAGE", message: OUT_OF_COVERAGE_NOTICE };
  return {
    code: "OUT_OF_COVERAGE",
    message:
      `«${variable.label}» solo existe ${window}, y el rango pedido es ` +
      `${formatRange(range)}: no es que falte el dato, es que no se medía.`,
  };
}

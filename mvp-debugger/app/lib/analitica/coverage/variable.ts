// La cobertura de CADA VARIABLE, según la publica `GET /analitica/variables`:
// en qué ventana existe y por qué no coexiste con un rango.
import type { CatalogVariable } from "@/app/lib/analitica/contracts/variables";
import { addDays, formatRange, rangesOverlap, type DateRange } from "@/app/lib/analitica/dateRange";

import { OUT_OF_COVERAGE_NOTICE, VERIFIED_COVERAGE } from "./verified";

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

// Si tiene sentido pedirle esta variable a este rango, y si no, por qué no.
//
// Se decide ANTES de consultar, como hace `analitica.cobertura` en el backend.
// Motivo: `/analitica/series` responde 200 con todos los puntos en null tanto
// cuando el sensor no estaba puesto como cuando simplemente no hubo lecturas.
// Los dos casos se ven idénticos en el payload y NO son lo mismo: uno se arregla
// moviendo el rango y el otro no se arregla nunca. Preguntar igual gastaría una
// petición para volver con un vacío que ya sabíamos, y sin poder explicarlo.
//
// El gate de «se puede pedir» es `graficable`, que el backend resuelve por la
// misma puerta que usa el endpoint. NO se deduce de `fuente_ausente`: ese campo
// es el porqué en prosa, y deducir el permiso de la explicación es justo cómo se
// llega a ofrecer una clave que responde 400.
import { OUT_OF_COVERAGE_NOTICE, VERIFIED_COVERAGE } from "@/app/lib/analitica/coverage";
import { addDays, rangesOverlap, type DateRange } from "@/app/lib/analitica/dateRange";
import type { ChartEmptyReason } from "@/app/components/charts";
import type { CatalogVariable } from "@/app/lib/analitica/contracts/variables";

export type VariableAvailability =
  | { readonly status: "available" }
  /** No hay nada que pedir. `reason` ya está redactado para la pantalla. */
  | { readonly status: "unavailable"; readonly reason: ChartEmptyReason };

const MOVE_RANGE_HINT = "Elegí un rango dentro de esa ventana, o cambiá de variable.";
const NO_SOURCE_HINT = "La prueba de calidad la reporta igual, para que el hueco quede medido.";

/** Ventana [desde, hasta) en que la variable EXISTE, acotada por la base. */
export function coverageOf(variable: CatalogVariable): Pick<DateRange, "from" | "toExclusive"> {
  return {
    from: variable.from ?? VERIFIED_COVERAGE.from,
    // `until` es el último día CON dato, inclusive; la ventana es semiabierta.
    toExclusive: variable.until ? addDays(variable.until, 1) : VERIFIED_COVERAGE.toExclusive,
  };
}

/** La ventana en prosa: «desde el X», «hasta el X» o «entre el X y el Y». */
export function describeCoverage(variable: CatalogVariable): string | null {
  if (variable.from && variable.until) return `entre el ${variable.from} y el ${variable.until}`;
  if (variable.from) return `desde el ${variable.from}`;
  if (variable.until) return `hasta el ${variable.until}`;
  return null;
}

export function availabilityOf(
  variable: CatalogVariable,
  range: DateRange,
): VariableAvailability {
  if (!variable.plottable) {
    const why = variable.missingSource ?? "el servicio no la acepta como serie";
    return {
      status: "unavailable",
      reason: { code: "NO_SOURCE", message: `«${variable.label}»: ${why}.`, hint: NO_SOURCE_HINT },
    };
  }
  if (rangesOverlap(range, coverageOf(variable))) return { status: "available" };

  const window = describeCoverage(variable);
  if (!window) {
    return {
      status: "unavailable",
      reason: { code: "OUT_OF_COVERAGE", message: OUT_OF_COVERAGE_NOTICE },
    };
  }
  return {
    status: "unavailable",
    reason: {
      code: "OUT_OF_COVERAGE",
      message:
        `«${variable.label}» solo existe ${window}. Nunca coexistieron con el ` +
        `rango pedido: no falta el dato, la variable todavía no se medía.`,
      hint: MOVE_RANGE_HINT,
    },
  };
}

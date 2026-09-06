// Los cortes de la comparación: cada manera independiente de medir quién produce
// más, con quién queda arriba en cada una.
//
// Es lo que hace creíble al veredicto, así que se lee de una pasada y arriba: si
// el ganador dependiera del método, el resultado sería del método y no del
// arreglo. Cada corte trae SU muestra al lado porque no todos miden lo mismo: las
// seis variantes del PR se agregan cada una sobre sus propios días, y el cruce
// punto a punto conserva solo las lecturas que coinciden por marca de tiempo.
//
// Acá NO nace ningún número. Se ordenan dos valores que ya vinieron hechos (lo
// mismo que ya hacía `variants.ts`) y se CUENTAN los cortes que coinciden con el
// ganador que declaró el backend. Contar coincidencias no produce una magnitud
// nueva; elegir un ganador por mayoría sí, y por eso el ganador se toma del
// servicio y jamás se deduce de esta lista.
import { isMeasured } from "@/app/lib/analitica";
import type {
  ArrayComparison,
  ArrayKey,
  PerformanceReport,
} from "@/app/lib/analitica/contracts/comparativa";
import { readVariants, type Variant } from "@/app/components/analitica/comparativa/variants";
import {
  ARRAY_KEYS,
  describeMissingReason,
} from "@/app/components/analitica/comparativa/vocabulary";

/** `readable`: se puede leer como rendimiento. `impossible`: el backend lo marcó
 *  por encima del límite físico. `missing`: no hay número, y el motivo lo dice. */
export type CutStatus = "readable" | "impossible" | "missing";

/** Sobre cuánto de lo disponible se agregó ESTE corte. Los dos números son del
 *  backend; el ancho de la barra que los dibuja es lo único que sale de acá. */
export type CutSample = {
  readonly value: number;
  readonly total: number;
  readonly unit: string;
};

export type Cut = {
  readonly id: string;
  readonly label: string;
  readonly sample: CutSample;
  readonly leader: ArrayKey | null;
  readonly status: CutStatus;
  /** Por qué el corte no deja a nadie arriba. Lo redacta el backend. */
  readonly note: string | null;
};

export type Agreement = {
  readonly agreeing: number;
  readonly comparable: number;
};

const DAYS_UNIT = "días";
const READINGS_UNIT = "lecturas";
const CROSS_ID = "cruce-5-min";
/** Se nombra distinto a propósito: emparejar por marca de tiempo da un cociente
 *  en kWh por kWh/m2, no un PR, y leerlo en la misma escala sería un error. */
const CROSS_LABEL = "Cruce punto a punto (no es un PR)";

/** Los seis cortes del PR más el cruce, cuando la comparación llegó. */
export function cutsOf(
  report: PerformanceReport,
  comparison: ArrayComparison | null,
): readonly Cut[] {
  const fromVariants = readVariants(report).map((variant) =>
    cutOfVariant(variant, report.dayCounts.valid),
  );
  return comparison ? [...fromVariants, cutOfCross(comparison)] : fromVariants;
}

function cutOfVariant(variant: Variant, validDays: number): Cut {
  const missing = ARRAY_KEYS.some((array) => variant.cells[array].pr === null);
  return {
    id: variant.id,
    label: variant.label,
    sample: { value: variant.days, total: validDays, unit: DAYS_UNIT },
    leader: variant.leader,
    status: variantStatus(variant, missing),
    note: missing ? describeMissingReason(variant.missingReason) : null,
  };
}

function variantStatus(variant: Variant, missing: boolean): CutStatus {
  if (!variant.readable) return "impossible";
  return missing ? "missing" : "readable";
}

function cutOfCross(comparison: ArrayComparison): Cut {
  const tilted = comparison.cross.yieldByArray.inclinado;
  const vertical = comparison.cross.yieldByArray.vertical;
  const comparable = isMeasured(tilted) && isMeasured(vertical);
  return {
    id: CROSS_ID,
    label: CROSS_LABEL,
    // Las dos muestras emparejadas difieren en unas pocas lecturas (3.041 y
    // 3.022 sobre el histórico completo). Acá va la del inclinado, que es el
    // arreglo de referencia, y las dos exactas están en el panel del cruce.
    sample: {
      value: comparison.cross.readingsByArray.inclinado,
      total: comparison.totals.inclinado.readings,
      unit: READINGS_UNIT,
    },
    leader: comparable ? leaderOf(tilted.value, vertical.value) : null,
    status: comparable ? "readable" : "missing",
    note: comparable ? null : describeMissingReason(crossReason(comparison)),
  };
}

function leaderOf(tilted: number, vertical: number): ArrayKey | null {
  if (tilted === vertical) return null;
  return tilted > vertical ? "inclinado" : "vertical";
}

function crossReason(comparison: ArrayComparison): string | null {
  for (const array of ARRAY_KEYS) {
    const metric = comparison.cross.yieldByArray[array];
    if (!isMeasured(metric)) return metric.reason;
  }
  return null;
}

/** Cuántos cortes comparables dan el mismo ganador que el backend ya declaró. */
export function agreementWith(winner: ArrayKey | null, cuts: readonly Cut[]): Agreement {
  const comparable = cuts.filter((cut) => cut.status === "readable");
  return {
    agreeing: comparable.filter((cut) => cut.leader === winner).length,
    comparable: comparable.length,
  };
}

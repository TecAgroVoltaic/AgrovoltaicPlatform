// Las seis variantes del PR (dos caminos de energía × tres irradiancias), en una
// lista plana y con las banderas que manda el backend ya a la vista.
//
// Existe para que el resultado se pueda leer SIN elegir un método: si las seis
// se muestran juntas, cada una sobre su propio conjunto de días, se ve que el
// ganador no depende de cuál se mire. Mostrar solo el número final tiraría a la
// basura la parte que lo hace creíble.
//
// Acá NO se calcula ningún número. Lo único que se deriva es un ORDEN entre dos
// PR que ya vinieron hechos, y solo cuando el backend NO marcó la variante como
// físicamente imposible: poner «gana el Vertical» sobre un PR de 1,217 sería
// justo el error que la marca existe para evitar.
import type {
  ArrayKey,
  EnergySource,
  IrradianceInput,
  PerformanceCell,
  PerformancePair,
  PerformanceReport,
  VariantPath,
} from "@/app/lib/analitica/contracts/comparativa";
import { ARRAY_KEYS, INPUT_LABEL, SOURCE_LABEL } from "@/app/components/analitica/comparativa/vocabulary";

export type VariantId = `${EnergySource}/${IrradianceInput}`;

export type Variant = {
  readonly id: VariantId;
  readonly source: EnergySource;
  readonly input: IrradianceInput;
  /** «Contador · GHI horizontal». */
  readonly label: string;
  /** Días válidos sobre los que se agregó ESTA variante, y no las otras cinco. */
  readonly days: number;
  readonly cells: PerformancePair;
  /** false cuando el backend marcó un PR > 1: no se puede leer como rendimiento. */
  readonly readable: boolean;
  /** El insumo es una transposición modelada que espera el aval de Hugo (R2). */
  readonly provisional: boolean;
  /** Quién queda arriba, o null si empatan, falta un PR o la variante no es legible. */
  readonly leader: ArrayKey | null;
  /** Por qué esta variante no trae número. Lo redacta el backend. */
  readonly missingReason: string | null;
  /** El aviso del backend sobre el PR imposible, si lo hay. */
  readonly limitWarning: string | null;
};

const SOURCES: readonly EnergySource[] = ["contador", "integral"];
const INPUTS: readonly IrradianceInput[] = ["ghi", "poa_bifacial", "poa_frontal"];

export function variantPath(
  source: EnergySource,
  input: IrradianceInput,
  array: ArrayKey,
): VariantPath {
  return `${source}/${input}/${array}`;
}

/** Las seis, siempre en el mismo orden: el contador (camino principal) primero. */
export function readVariants(report: PerformanceReport): readonly Variant[] {
  return SOURCES.flatMap((source) =>
    INPUTS.map((input) => buildVariant(report, source, input)),
  );
}

function buildVariant(
  report: PerformanceReport,
  source: EnergySource,
  input: IrradianceInput,
): Variant {
  const cells = report.matrix[source][input];
  const readable = !ARRAY_KEYS.some((array) => cells[array].exceedsPhysicalLimit);
  return {
    id: `${source}/${input}`,
    source,
    input,
    label: `${SOURCE_LABEL[source]} · ${INPUT_LABEL[input]}`,
    days: cells.inclinado.days,
    cells,
    readable,
    provisional: report.pendingApproval.provisionalInputs.includes(input),
    leader: readable ? leaderOf(cells) : null,
    missingReason: firstReason(cells),
    limitWarning: firstWarning(cells),
  };
}

/** Ordenar dos números que ya vinieron del backend no es recalcularlos: el
 *  navegador no produce ninguna cifra nueva, solo dice cuál de las dos es mayor. */
function leaderOf(cells: PerformancePair): ArrayKey | null {
  const tilted = cells.inclinado.pr;
  const vertical = cells.vertical.pr;
  if (tilted === null || vertical === null || tilted === vertical) return null;
  return tilted > vertical ? "inclinado" : "vertical";
}

function firstReason(cells: PerformancePair): string | null {
  return pick(cells, (cell) => (cell.pr === null ? cell.reason : null));
}

function firstWarning(cells: PerformancePair): string | null {
  return pick(cells, (cell) => cell.warning);
}

function pick(
  cells: PerformancePair,
  read: (cell: PerformanceCell) => string | null,
): string | null {
  for (const array of ARRAY_KEYS) {
    const value = read(cells[array]);
    if (value) return value;
  }
  return null;
}

/** Las que se pueden dibujar en una escala de PR sin mentir. */
export function readableVariants(variants: readonly Variant[]): readonly Variant[] {
  return variants.filter((variant) => variant.readable && variant.cells.inclinado.pr !== null);
}

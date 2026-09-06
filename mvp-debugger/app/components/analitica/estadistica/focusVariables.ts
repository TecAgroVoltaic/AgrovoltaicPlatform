// Qué variable se puede poner en foco y hasta dónde llega cada una.
//
// LA VENTANA DE CADA VARIABLE NO ES LA DEL HISTÓRICO. El SP722 corrió dieciocho
// días con 360 lecturas y el albedo tiene siete meses, no diecinueve: para casi
// cualquier rango que elija la persona esos gráficos salen vacíos, y la razón es
// que el sensor apenas midió, no que falten datos. Sin este cuadro, la vista
// devolvería un lienzo en blanco donde debería decir eso.
//
// DEUDA CONOCIDA: las ventanas están copiadas a mano de `analitica/catalogo.py`
// (`dato_desde` / `dato_hasta`, leídas el 2026-09-01) porque el Histórico no
// publica su catálogo por HTTP. `analitica/crestas` y `analitica/correlacion` sí
// mandan el motivo ya redactado y ahí se usa el del backend; `distribucion` y
// `carpeta` no lo mandan, y son las dos que obligan a tener esto. Cuando exista
// el endpoint del catálogo se reemplaza acá y nada más cambia.
import { VERIFIED_COVERAGE } from "@/app/lib/analitica/coverage";
import { rangesOverlap, type DateRange, type IsoDate } from "@/app/lib/analitica/dateRange";

/** Ventana en que la variable EXISTE, con fin exclusivo como todo rango acá. */
export type VariableCoverage = {
  readonly from: IsoDate;
  readonly toExclusive: IsoDate;
  /** Por qué la ventana es esa. Es lo que se le dice a la persona. */
  readonly note: string;
};

export type FocusVariable = {
  /** Clave del catálogo del backend: viaja tal cual en la query. */
  readonly key: string;
  /** Etiqueta de la interfaz. Nunca "PV1" a secas: PV1 es el Inclinado. */
  readonly label: string;
  readonly coverage: VariableCoverage;
};

const WHOLE_HISTORY: VariableCoverage = {
  ...VERIFIED_COVERAGE,
  note: "el histórico PV va del 2024-11-10 al 2026-06-01, cuando el sistema dejó de reportar",
};

// La irradiancia anterior a esta fecha se descarta por decisión del equipo: el
// error del sensor se corrigió a mediados de 2025.
const CALIBRATED_IRRADIANCE: VariableCoverage = {
  from: "2025-07-01",
  toExclusive: VERIFIED_COVERAGE.toExclusive,
  note: "la irradiancia solo es válida desde el 2025-07-01: la anterior se descarta por el error de sensor que se corrigió a mediados de 2025",
};

// Sin piranómetro de reflejada no hay albedo, y se instaló casi un año después
// que el de incidente.
const REFLECTED_PYRANOMETER: VariableCoverage = {
  from: "2025-10-25",
  toExclusive: VERIFIED_COVERAGE.toExclusive,
  note: "el piranómetro de reflejada se instaló el 2025-10-25: esta variable tiene siete meses de ventana, no diecinueve",
};

const SP722: VariableCoverage = {
  from: "2026-05-11",
  // `dato_hasta` del catálogo es INCLUSIVO (2026-05-28) y acá el fin es exclusivo.
  toExclusive: "2026-05-29",
  note: "el SP722 registró dieciocho días, del 2026-05-11 al 2026-05-28, y se detuvo: son 360 lecturas en todo el histórico",
};

export const FOCUS_VARIABLES: readonly FocusVariable[] = [
  { key: "potencia_pv1_w", label: "Potencia Inclinado (PV1)", coverage: WHOLE_HISTORY },
  { key: "potencia_pv2_w", label: "Potencia Vertical (PV2)", coverage: WHOLE_HISTORY },
  { key: "temp_inclinado", label: "Temperatura Inclinado", coverage: WHOLE_HISTORY },
  { key: "temp_vertical", label: "Temperatura Vertical", coverage: WHOLE_HISTORY },
  {
    key: "irradiancia_incidente_wm2",
    label: "Irradiancia incidente",
    coverage: CALIBRATED_IRRADIANCE,
  },
  {
    key: "irradiancia_reflejada_wm2",
    label: "Irradiancia reflejada",
    coverage: REFLECTED_PYRANOMETER,
  },
  { key: "albedo", label: "Albedo", coverage: REFLECTED_PYRANOMETER },
  {
    key: "irradiancia_incidente_sp722_wm2",
    label: "Irradiancia SP722",
    coverage: SP722,
  },
];

export const DEFAULT_FOCUS_VARIABLE: FocusVariable = FOCUS_VARIABLES[0];

export function findFocusVariable(key: string | null): FocusVariable {
  return FOCUS_VARIABLES.find((variable) => variable.key === key) ?? DEFAULT_FOCUS_VARIABLE;
}

/**
 * Por qué el rango no toca la ventana de estas variables, o `null` si la toca.
 *
 * Con varias variables es la INTERSECCIÓN de sus ventanas, porque quien pide dos
 * las quiere cruzar: basta que una no se solape para que no haya nada que mirar.
 */
export function coverageGap(
  range: DateRange,
  ...variables: readonly FocusVariable[]
): string | null {
  const missing = variables.find((variable) => !rangesOverlap(range, variable.coverage));
  return missing ? `${missing.label}: ${missing.coverage.note}.` : null;
}

/** La irradiancia que integra la Fig. 6 y que hace de eje X en la Fig. 8. */
export const INCIDENT_IRRADIANCE: FocusVariable = findFocusVariable(
  "irradiancia_incidente_wm2",
);

/**
 * Qué se enfrenta a la irradiancia en la Fig. 8: la variable en foco, salvo
 * cuando la variable en foco ES la irradiancia (correlacionar algo consigo mismo
 * da una recta perfecta que no dice nada). Ahí cae a la potencia del Inclinado.
 */
export function correlationTargetFor(focus: FocusVariable): FocusVariable {
  return focus.key === INCIDENT_IRRADIANCE.key ? DEFAULT_FOCUS_VARIABLE : focus;
}

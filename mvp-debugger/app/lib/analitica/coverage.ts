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
////
// DEUDA CONOCIDA: la cobertura de la BASE sigue a mano porque ningún endpoint
// la publica (ver `coverage/verified.ts`).
//
// Barril: la cobertura verificada, el rango por defecto con sus atajos y la
// cobertura por variable viven cada uno en su módulo de `coverage/`.
export {
  VERIFIED_COVERAGE,
  COVERAGE_FACTS,
  LAST_DAY_WITH_DATA,
  OUT_OF_COVERAGE_NOTICE,
} from "./coverage/verified";
export { DEFAULT_RANGE, RANGE_PRESETS, type RangePreset } from "./coverage/presets";
export {
  variableWindow,
  describeVariableWindow,
  variableCoverage,
  type CoverageGapCode,
  type CoverageGap,
  type VariableCoverage,
} from "./coverage/variable";

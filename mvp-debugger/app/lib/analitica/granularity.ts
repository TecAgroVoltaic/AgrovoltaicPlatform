// Grano temporal de una agregación.
//
// El backend habla en español (`hora|dia|semana|mes`) y los identificadores de
// TypeScript van en inglés: ESTA es la única traducción entre ambos mundos. Si
// aparece un `"dia"` suelto en un componente, está saltándose esta capa.

/** Grano de agregación de una serie o métrica. */
export type Granularity = "hour" | "day" | "week" | "month";

/** Orden de menor a mayor grano: lo usa el selector para pintar las opciones. */
export const GRANULARITIES: readonly Granularity[] = ["hour", "day", "week", "month"];

/** Valor que viaja por la URL y por la API (en español, como el backend). */
const WIRE_BY_GRANULARITY: Readonly<Record<Granularity, string>> = {
  hour: "hora",
  day: "dia",
  week: "semana",
  month: "mes",
};

const GRANULARITY_BY_WIRE: ReadonlyMap<string, Granularity> = new Map(
  GRANULARITIES.map((granularity) => [WIRE_BY_GRANULARITY[granularity], granularity]),
);

/** Etiqueta de interfaz, en español, para mostrarle el grano a la persona. */
export const GRANULARITY_LABEL: Readonly<Record<Granularity, string>> = {
  hour: "horaria",
  day: "diaria",
  week: "semanal",
  month: "mensual",
};

/** Qué representa un punto con ese grano (el pie de los gráficos lo necesita). */
export const GRANULARITY_POINT_LABEL: Readonly<Record<Granularity, string>> = {
  hour: "Cada punto es una hora",
  day: "Cada punto es un día",
  week: "Cada punto es una semana",
  month: "Cada punto es un mes",
};

export function granularityToWire(granularity: Granularity): string {
  return WIRE_BY_GRANULARITY[granularity];
}

/** `null` si el valor no es uno de los cuatro granos que el backend acepta. */
export function granularityFromWire(wire: string): Granularity | null {
  return GRANULARITY_BY_WIRE.get(wire) ?? null;
}

// Los nombres de los parámetros van en español porque son parte del contrato
// público (URL + backend); los identificadores, en inglés.
export const RANGE_PARAM = {
  from: "desde",
  toExclusive: "hasta",
  granularity: "granularidad",
} as const;

/** Lo mínimo que hace falta para leer parámetros: lo cumplen `URLSearchParams` y
 * el `ReadonlyURLSearchParams` de Next sin adaptador de por medio. */
export type ParamReader = { get(name: string): string | null };

/** Adapta el `searchParams` que recibe una página (Server Component). */
export function readerFromRecord(
  record: Readonly<Record<string, string | string[] | undefined>>,
): ParamReader {
  return {
    get(name) {
      const value = record[name];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

/** Lo mínimo para RECORRER una query. Lo cumplen `URLSearchParams` y el
 *  `ReadonlyURLSearchParams` de Next sin adaptador de por medio. */
export type ParamEntries = Iterable<readonly [string, string]>;

// Los enlaces viejos al tablero: antes vivía en `/`, así que un `/?clima=2025` o
// un `/?desde=…` guardado o compartido tiene que seguir abriendo el tablero con
// la misma query. Se reconoce por los parámetros que el catálogo declara para el
// tablero, no por una lista escrita acá: si el tablero gana uno, esto lo sigue.
import { findSectionEntry } from "@/app/lib/navegacion/catalog";
import { TABLERO_PATH } from "@/app/lib/navegacion/paths";

const TABLERO_ID = "tablero";

type SearchParamsRecord = Readonly<Record<string, string | string[] | undefined>>;

function toQuery(record: SearchParamsRecord): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(record)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(name, item);
  }
  return query.toString();
}

/** La ruta del tablero con la misma query, o null si `/` no trae nada del tablero. */
export function legacyDashboardHref(record: SearchParamsRecord): string | null {
  const tableroParams = findSectionEntry(TABLERO_ID)?.params.map((param) => param.nombre) ?? [];
  const isLegacy = tableroParams.some((name) => record[name] !== undefined);
  return isLegacy ? `${TABLERO_PATH}?${toQuery(record)}` : null;
}

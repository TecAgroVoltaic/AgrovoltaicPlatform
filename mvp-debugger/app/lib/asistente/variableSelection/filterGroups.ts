// La búsqueda local del selector de variables: por nombre legible, clave o
// unidad, sin distinguir mayúsculas ni tildes. Los grupos sin coincidencias se
// quitan para que la lista no quede llena de encabezados vacíos.
import type { CatalogGroup } from "@/app/lib/asistente/contracts/selectorVariablesSpec";

const DIACRITICS = /\p{Diacritic}/gu;

export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase().trim();
}

export function filterGroups(groups: readonly CatalogGroup[], query: string): CatalogGroup[] {
  const needle = normalizeForSearch(query);
  if (!needle) return [...groups];
  return groups
    .map((group) => ({
      ...group,
      variables: group.variables.filter((variable) =>
        normalizeForSearch(`${variable.etiqueta} ${variable.id} ${variable.unidad ?? ""} ${group.etiqueta}`).includes(needle),
      ),
    }))
    .filter((group) => group.variables.length > 0);
}

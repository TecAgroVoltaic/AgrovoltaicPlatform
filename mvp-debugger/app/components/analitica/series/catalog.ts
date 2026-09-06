// Cómo se le presenta el catálogo a la persona: orden de las familias, nombre en
// castellano y cuál se abre por defecto.
//
// Los DATOS del catálogo ya no viven acá: los publica `GET /analitica/variables`
// y los trae `loadCatalog.ts`. Este archivo solo tiene decisiones de interfaz, y
// por eso es seguro importarlo desde un componente de cliente.
import type { CatalogVariable, VariableCatalog } from "@/app/lib/analitica/contracts/variables";

/** Orden de lectura, no alfabético: lo ambiental va al final porque hoy no tiene
 *  ni una fuente ingestada y ninguna de sus variables se puede graficar. */
const FAMILY_ORDER: readonly string[] = ["electrico", "termico", "radiacion", "ambiental"];

const FAMILY_LABEL: Readonly<Record<string, string>> = {
  electrico: "Eléctrico",
  termico: "Térmico",
  radiacion: "Radiación",
  ambiental: "Ambiental",
};

/** La que se abre sin que nadie elija: la de ventana más larga y sin huecos. */
export const DEFAULT_VARIABLE_KEY = "potencia_pv1_w";

export function familyLabel(family: string): string {
  return FAMILY_LABEL[family] ?? family;
}

/** Las familias en orden de lectura. Una que el backend añada mañana no se
 *  pierde: va al final en vez de desaparecer del selector. */
export function orderedFamilies(catalog: VariableCatalog): readonly string[] {
  const known = FAMILY_ORDER.filter((family) => catalog.families.includes(family));
  const rest = catalog.families.filter((family) => !FAMILY_ORDER.includes(family));
  return [...known, ...rest];
}

export function variablesOfFamily(
  catalog: VariableCatalog,
  family: string,
): readonly CatalogVariable[] {
  return catalog.variables.filter((variable) => variable.family === family);
}

/** La variable pedida, o la primera que se pueda graficar si esa clave no está.
 *  Nunca devuelve `undefined`: la vista siempre tiene algo que mostrar. */
export function resolveVariable(catalog: VariableCatalog, key: string): CatalogVariable {
  const asked = catalog.variables.find((variable) => variable.key === key);
  if (asked) return asked;
  return catalog.variables.find((variable) => variable.plottable) ?? catalog.variables[0];
}

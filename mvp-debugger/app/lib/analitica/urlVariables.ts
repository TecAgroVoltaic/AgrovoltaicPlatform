// `?variables=` en la URL de Series: lo escribe «Abrir en Series» del asistente
// y lo lee la página. Claves del catálogo analítico separadas por coma. También
// acepta el id unificado del contrato (`supabase_pv:<clave>`): Series solo
// grafica Supabase PV, así que ese prefijo se quita y cualquier otro se descarta.
const PV_SOURCE_PREFIX = "supabase_pv:";
const SOURCE_SEPARATOR = ":";
const LIST_SEPARATOR = ",";

export const VARIABLES_PARAM = "variables";

/** Las claves pedidas, en orden, sin vacíos ni repetidas. Nunca lanza. */
export function requestedVariableKeys(raw: string | null): readonly string[] {
  if (!raw) return [];
  const keys = raw
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .map((item) => (item.startsWith(PV_SOURCE_PREFIX) ? item.slice(PV_SOURCE_PREFIX.length) : item))
    .filter((item) => item.length > 0 && !item.includes(SOURCE_SEPARATOR));
  return [...new Set(keys)];
}

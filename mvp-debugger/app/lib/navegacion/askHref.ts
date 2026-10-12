// A dónde lleva «Preguntar» desde el modo avanzado: al Asistente con el MISMO
// período que se estaba mirando, que es el contexto que el chat le pasa al
// agente. Solo viaja el rango: los demás parámetros son de la vista de origen.
import { RANGE_PARAM, type ParamReader } from "@/app/lib/analitica/urlRange";
import { ASISTENTE_PATH } from "@/app/lib/navegacion/paths";

const CARRIED_PARAMS = [RANGE_PARAM.from, RANGE_PARAM.toExclusive] as const;

export function askHref(current: ParamReader): string {
  const query = new URLSearchParams();
  for (const name of CARRIED_PARAMS) {
    const value = current.get(name);
    if (value) query.set(name, value);
  }
  const suffix = query.toString();
  return suffix ? `${ASISTENTE_PATH}?${suffix}` : ASISTENTE_PATH;
}

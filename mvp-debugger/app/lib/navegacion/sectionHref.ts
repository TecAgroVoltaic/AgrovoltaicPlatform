// El enlace a una sección de la consola que propone el asistente (contrato §4.3
// de docs/referencia/contratos-asistente-plataforma.md), armado con lista
// blanca: solo la ruta de una sección del catálogo y solo los parámetros que
// esa sección declara, con un valor que cumple su tipo. Lo demás se descarta.
import { RANGE_PARAM } from "@/app/lib/analitica/urlRange";
import { findSectionEntry, type SectionParam } from "@/app/lib/navegacion/catalog";

const VALUE_PATTERN_BY_TYPE: Readonly<Record<SectionParam["tipo"], RegExp>> = {
  fecha: /^\d{4}-\d{2}-\d{2}$/,
  anio: /^\d{4}$/,
  texto: /^.+$/,
  lista: /^.+$/,
};

const RANGE_PARAM_NAMES: readonly string[] = [RANGE_PARAM.from, RANGE_PARAM.toExclusive];

/** Lo mínimo para leer la query actual: lo cumple `URLSearchParams`. */
export type CurrentQuery = { readonly get: (name: string) => string | null };

export type SectionLinkRequest = {
  readonly sectionId: string;
  readonly params?: Readonly<Record<string, string>> | null;
};

/**
 * El href de la sección, o `null` si no está en el catálogo. Si la sección
 * acepta rango y el pedido no trae ninguna fecha, conserva el rango que la
 * persona tiene en la URL actual (si lo tiene).
 */
export function sectionHref({ sectionId, params }: SectionLinkRequest, current?: CurrentQuery): string | null {
  const section = findSectionEntry(sectionId);
  if (!section) return null;

  const query = new URLSearchParams();
  for (const param of section.params) {
    const value = params?.[param.nombre]?.trim();
    if (value && VALUE_PATTERN_BY_TYPE[param.tipo].test(value)) query.set(param.nombre, value);
  }

  const acceptsRange = RANGE_PARAM_NAMES.every((name) => section.params.some((param) => param.nombre === name));
  const requestedRange = RANGE_PARAM_NAMES.some((name) => query.has(name));
  if (current && acceptsRange && !requestedRange) {
    for (const name of RANGE_PARAM_NAMES) {
      const value = current.get(name);
      if (value && VALUE_PATTERN_BY_TYPE.fecha.test(value)) query.set(name, value);
    }
  }

  const search = query.toString();
  return search ? `${section.ruta}?${search}` : section.ruta;
}

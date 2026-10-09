// Las fuentes de datos que alimentan la consola, en un solo sitio. De acá salen
// la etiqueta de cada gráfico y tarjeta, y la sección «Fuentes de datos».
//
// El color es un acento discreto (el punto de la etiqueta), nunca un relleno: la
// fuente es contexto de lectura, no algo que compita con el dato.

export const SOURCE_IDS = [
  "supabase_pv",
  "supabase_ambiental",
  "agrodash_sc",
  "agrodash_cartago",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

/** Token de color de `tokens.css` que pinta el punto de la etiqueta. */
export type SourceTone = "real" | "ceil" | "pred" | "muted";

export type SourceInfo = {
  readonly id: SourceId;
  /** Lo que se lee en la etiqueta: corto, cabe junto a un título. */
  readonly label: string;
  /** El detalle, para el tooltip. */
  readonly description: string;
  readonly tone: SourceTone;
};

export const SOURCES: Readonly<Record<SourceId, SourceInfo>> = {
  supabase_pv: {
    id: "supabase_pv",
    label: "Supabase PV · San Carlos",
    description:
      "Histórico fotovoltaico de San Carlos en Supabase: inversor, piranómetros, calibración y Performance Ratio.",
    tone: "real",
  },
  supabase_ambiental: {
    id: "supabase_ambiental",
    label: "Store ambiental SC",
    description: "Lecturas ambientales de San Carlos copiadas desde AgroDash a Supabase.",
    tone: "ceil",
  },
  agrodash_sc: {
    id: "agrodash_sc",
    label: "AgroDash · cajas SC",
    description: "Cajas de San Carlos en AgroDash, leídas en vivo por su API pública.",
    tone: "pred",
  },
  agrodash_cartago: {
    id: "agrodash_cartago",
    label: "AgroDash · Cartago",
    description: "Sensores de suelo y ambiente de la región Cartago, leídos en vivo por la API de AgroDash.",
    tone: "muted",
  },
};

/** Todo lo eléctrico y de radiación de la consola sale de acá. */
export const PHOTOVOLTAIC_SOURCE: SourceId = "supabase_pv";

export function sourceInfo(id: SourceId): SourceInfo {
  return SOURCES[id];
}

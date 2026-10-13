// Los bloques de una respuesta del asistente. Cada variante es un `kind` con
// su carga; el spec llega SIN validar desde la traza y lo valida su renderer,
// que si no cumple lo dice en la tarjeta en vez de romper la respuesta entera.
//
// Agregar un bloque nuevo: una entrada en `BlockPayloadByKind`, un extractor en
// `extractors.ts` y un renderer en `components/asistente/blocks/blockRenderers`
// (el mapa de renderers es un tipo mapeado: sin la tercera pieza, no compila).

/** Variables y rango con que se pidió un gráfico: lo que hace falta para pedir
 * después la exportación de esos mismos datos. */
export type ChartRequest = {
  readonly variables: readonly string[];
  readonly from: string | null;
  readonly toExclusive: string | null;
  /** El grano tal como viaja (`hora|dia|semana|mes`), si el agente lo fijó. */
  readonly granularity: string | null;
};

/** Un spec tal como viene en la salida de la tool, todavía sin validar. */
type RawSpec = { readonly spec: unknown };

type BlockPayloadByKind = {
  readonly text: { readonly markdown: string };
  readonly chart: RawSpec & { readonly request: ChartRequest | null };
  readonly download: RawSpec;
  readonly report: RawSpec;
  readonly downloads: RawSpec;
  readonly variableSelector: RawSpec;
  readonly navigation: RawSpec;
  readonly documents: RawSpec;
  readonly calendar: RawSpec;
};

export type MessageBlockKind = keyof BlockPayloadByKind;

/** Los bloques que no llevan más que su spec. */
export type SpecBlockKind = Exclude<MessageBlockKind, "text" | "chart">;

/** Escrito como tipo mapeado indexado para que un renderer genérico en `Kind`
 *  pueda llamar al de su `kind` sin casteos (uniones correlacionadas). */
export type BlockOfKind<Kind extends MessageBlockKind = MessageBlockKind> = {
  [K in Kind]: { readonly kind: K; readonly key: string } & BlockPayloadByKind[K];
}[Kind];

export type MessageBlock = BlockOfKind;

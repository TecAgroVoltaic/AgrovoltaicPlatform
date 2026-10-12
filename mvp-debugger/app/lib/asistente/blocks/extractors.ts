// El registro marcador → extractor (contrato §4 de
// docs/referencia/contratos-asistente-plataforma.md). Cada clave es una clave
// de la salida de una tool; su extractor la convierte en un bloque. El orden de
// las claves es el orden en que salen los bloques de un mismo paso.
import { chartRequest } from "@/app/lib/asistente/blocks/chartRequest";
import type { MessageBlock, SpecBlockKind } from "@/app/lib/asistente/blocks/types";

/** Lo que un extractor sabe del paso, además del valor de su marcador. */
export type MarkerContext = {
  /** El `input` de la tool, sin validar. */
  readonly input: unknown;
  /** La clave estable del paso dentro de la respuesta (`paso-<i>`). */
  readonly stepKey: string;
};

/** `null` cuando el valor no es para este bloque (ver `descarga`). */
export type MarkerExtractor = (value: unknown, context: MarkerContext) => MessageBlock | null;

/** El informe Excel de `preparar_informe` viaja en `descarga`, sin `_`: lo lee
 *  también el LLM. Como es una clave genérica, se toma solo si trae `ruta`. */
const REPORT_MARKER = "descarga";

const rawSpec =
  (kind: SpecBlockKind, suffix: string): MarkerExtractor =>
  (spec, { stepKey }) => ({ kind, key: `${stepKey}-${suffix}`, spec });

export const MARKER_EXTRACTORS: Readonly<Record<string, MarkerExtractor>> = {
  _grafico: (spec, { input, stepKey }) => ({ kind: "chart", key: stepKey, spec, request: chartRequest(input) }),
  _descarga: rawSpec("download", "descarga"),
  _descargas: rawSpec("downloads", "descargas"),
  [REPORT_MARKER]: (value, context) => (hasRoute(value) ? rawSpec("report", "informe")(value, context) : null),
  _selector_variables: rawSpec("variableSelector", "selector"),
  _navegacion: rawSpec("navigation", "navegacion"),
  _documentos: rawSpec("documents", "documentos"),
};

/** Los bloques que aporta la salida de una tool, en el orden del registro. */
export function extractMarkerBlocks(output: Readonly<Record<string, unknown>>, context: MarkerContext): MessageBlock[] {
  return Object.entries(MARKER_EXTRACTORS).flatMap(([marker, extract]) => {
    if (!(marker in output)) return [];
    const block = extract(output[marker], context);
    return block ? [block] : [];
  });
}

function hasRoute(value: unknown): boolean {
  return typeof value === "object" && value !== null && "ruta" in value && typeof value.ruta === "string";
}

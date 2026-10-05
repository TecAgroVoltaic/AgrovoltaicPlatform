// El sobre que comparten TODAS las respuestas de análisis:
//   { ventana: {...}, confianza: {...}, ...payload }
//
// Se valida en la frontera y se traduce a inglés acá, una sola vez. Un
// componente que reciba esto ya no sabe (ni tiene por qué saber) que el backend
// habla español.
import { z } from "zod";

import { granularityFromWire, type Granularity } from "@/app/lib/analitica/granularity";
import type { DateRange } from "@/app/lib/analitica/dateRange";

/** La ventana que el backend dice haber usado. No tiene por qué coincidir con la
 * pedida (puede recortarla a la cobertura real), y por eso se muestra. */
export type AnalysisWindow = DateRange & { readonly days: number };

/** El bloque de fiabilidad que el backend incrusta en cada agregado.
 *
 * Se valida como objeto y se deja opaco A PROPÓSITO: su forma exacta la define
 * `historico.calidad.contexto.confianza`, que sigue en construcción. Inventarle
 * campos acá sería peor que dejarlo abierto, porque el primer despliegue haría
 * fallar la validación de todas las respuestas a la vez. Cuando el backend lo
 * publique, se aprieta este esquema y nada más cambia. */
export type Confidence = Readonly<Record<string, unknown>>;

/** La `ventana` del backend, suelta. Se exporta porque hay respuestas que la
 * traen SIN el resto del sobre (o que se leen por partes), y sin esto cada vista
 * termina interpretando `desde`/`hasta`/`granularidad` a mano: tres formas de
 * leer el mismo período es la manera de que dos pantallas discrepen. */
export const windowSchema = z
  .object({
    desde: z.string(),
    hasta: z.string(),
    dias: z.number().int().nonnegative(),
    granularidad: z.string(),
  })
  .transform((raw, ctx): AnalysisWindow => {
    const granularity: Granularity | null = granularityFromWire(raw.granularidad);
    if (!granularity) {
      ctx.addIssue({
        code: "custom",
        message: `granularidad desconocida: ${raw.granularidad}`,
      });
      return z.NEVER;
    }
    return { from: raw.desde, toExclusive: raw.hasta, days: raw.dias, granularity };
  });

const confidenceSchema: z.ZodType<Confidence> = z.record(z.string(), z.unknown());

export type AnalysisResponse<TPayload> = {
  readonly window: AnalysisWindow;
  readonly confidence: Confidence;
  readonly payload: TPayload;
};

/**
 * Construye el esquema completo de una respuesta a partir de la forma de SU
 * payload. El payload viaja al mismo nivel que el sobre (no anidado), así que se
 * mezcla en el objeto y se vuelve a separar al transformar.
 *
 * @example
 *   const energySchema = analysisResponse({ energia_kwh: metricSchema });
 *   const parsed = energySchema.parse(await response.json());
 *   parsed.payload.energia_kwh.status; // "measured" | "missing"
 */
export function analysisResponse<TShape extends z.ZodRawShape>(payloadShape: TShape) {
  return z
    .object({ ventana: windowSchema, confianza: confidenceSchema })
    .and(z.object(payloadShape))
    .transform(({ ventana, confianza, ...payload }) => ({
      window: ventana,
      confidence: confianza,
      payload,
    }));
}

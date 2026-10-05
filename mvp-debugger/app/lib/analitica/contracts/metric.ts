// Un escalar del backend, modelado para que la interfaz NO pueda confundir
// "no hay dato" con "cero".
//
// El backend manda `{valor, n, unidad, motivo}` y `valor: null` cuando n = 0.
// Si eso llegara crudo a un componente, un `valor ?? 0` distraído convertiría
// los cuatro meses de potencia AC en NULL en cuatro meses de producción cero, y
// el tablero pasaría a mentir sin que nada falle. Por eso acá se parte en dos
// estados: con `status: "missing"` no existe el campo `value`, así que no hay
// forma de pintarlo sin decidir antes qué se muestra en su lugar.
import { z } from "zod";

export type Metric =
  | {
      readonly status: "measured";
      readonly value: number;
      readonly count: number;
      readonly unit: string;
      readonly explanation?: string;
    }
  | {
      readonly status: "missing";
      readonly count: number;
      readonly unit: string;
      /** El CÓDIGO del backend (`sin_lecturas`, `fuera_de_cobertura`): sirve para
       *  DECIDIR, no para mostrar. Hay vistas que lo comparan. */
      readonly reason: string;
      /** La prosa que el backend ya redactó en castellano para ese código. Es lo
       *  que va a la pantalla; sin ella cada vista reescribe el mismo texto y se
       *  desincroniza del servicio. */
      readonly explanation?: string;
    };

/** Lo que se muestra donde iría el número cuando no hay número. */
export const MISSING_VALUE_TEXT = "sin dato";

const DEFAULT_MISSING_REASON = "el backend no reportó valor para este período";
const NO_SAMPLES_REASON = "no hay muestras en el período";

const rawMetricSchema = z.object({
  valor: z.number().nullable(),
  n: z.number().int().nonnegative(),
  unidad: z.string(),
  motivo: z.string().nullish(),
  explicacion: z.string().nullish(),
});

/** Contrato de un escalar del backend, ya traducido a `Metric`. */
export const metricSchema = rawMetricSchema.transform((raw): Metric => {
  // n = 0 con valor presente contradice el contrato de `resultado.metrica`. Se
  // trata como ausente: un promedio de cero muestras no es un número, y creerle
  // es peor que perderlo.
  if (raw.valor === null || raw.n === 0) {
    return {
      status: "missing",
      count: raw.n,
      unit: raw.unidad,
      reason: raw.motivo ?? (raw.n === 0 ? NO_SAMPLES_REASON : DEFAULT_MISSING_REASON),
      ...(raw.explicacion ? { explanation: raw.explicacion } : {}),
    };
  }
  return {
    status: "measured",
    value: raw.valor,
    count: raw.n,
    unit: raw.unidad,
    ...(raw.explicacion ? { explanation: raw.explicacion } : {}),
  };
});

export function isMeasured(
  metric: Metric,
): metric is Extract<Metric, { status: "measured" }> {
  return metric.status === "measured";
}

/**
 * Qué se le dice a la persona donde iba el número: la prosa del backend si vino,
 * y si no el motivo, que en ese caso ya es texto legible.
 *
 * Pide la métrica YA estrechada a `missing` para que nadie la use sobre una que
 * sí tiene valor. Existe para que ninguna vista vuelva a escribir a mano el
 * texto de «sin lecturas»: quien lo redacta es el servicio, una sola vez.
 */
export function explainMissing(metric: Extract<Metric, { status: "missing" }>): string {
  return metric.explanation ?? metric.reason;
}

const LOCALE = "es-CR";
const DEFAULT_DECIMALS = 1;

/** El número con formato local, o el texto de ausencia. Nunca un cero inventado. */
export function formatMetric(metric: Metric, decimals = DEFAULT_DECIMALS): string {
  if (!isMeasured(metric)) return MISSING_VALUE_TEXT;
  return metric.value.toLocaleString(LOCALE, { maximumFractionDigits: decimals });
}

// Formato de cifras para la vista. Solo PRESENTA lo que ya vino calculado: no
// hay una sola división acá, porque un porcentaje recalculado en el navegador es
// como el experto humano y el agente terminan discrepando sobre el mismo dato.
const LOCALE = "es-CR";
const PERCENT_DECIMALS = 1;
const PERCENT_FACTOR = 100;

const countFormatter = new Intl.NumberFormat(LOCALE);

/** Una fracción que YA vino del backend, mostrada como porcentaje. */
export function formatFraction(fraction: number | null): string {
  if (fraction === null) return "sin dato";
  return `${(fraction * PERCENT_FACTOR).toFixed(PERCENT_DECIMALS)} %`;
}

export function formatCount(value: number | null): string {
  return value === null ? "sin dato" : countFormatter.format(value);
}

export function pluralizeDays(days: number): string {
  return days === 1 ? "día" : "días";
}

/** La misma fracción del backend, escrita como alto de CSS. Es el cambio de
 * unidad de `formatFraction`, no un cálculo: nadie divide nada acá, y la tira
 * llena significa exactamente los días del rango que ya publicó el servicio. */
export function toCssHeight(fraction: number): string {
  return `${fraction * PERCENT_FACTOR}%`;
}

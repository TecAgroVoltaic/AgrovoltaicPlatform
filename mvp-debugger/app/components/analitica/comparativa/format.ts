// Formato de la vista: dar forma a lo que ya vino, nunca calcularlo.
//
// Todo lo de acá es presentación pura. Ni un promedio, ni una resta: si un
// número no llegó del backend, no aparece en pantalla.
const LOCALE = "es-CR";

/** Tres decimales porque son los que redondea el backend. Con uno solo, 0,648 y
 *  0,612 se verían iguales y la comparación entera perdería sentido. */
const PR_DECIMALS = 3;
const PERCENT_DECIMALS = 0;
const DECIMAL_DIGITS = 2;

/** Lo que se escribe donde iría el número cuando no hay número. */
export const MISSING_TEXT = "sin dato";

const prFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: PR_DECIMALS,
  maximumFractionDigits: PR_DECIMALS,
});

export function formatPr(pr: number | null): string {
  return pr === null ? MISSING_TEXT : prFormatter.format(pr);
}

const integerFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  return integerFormatter.format(value);
}

export function formatDays(days: number): string {
  return days === 1 ? "1 día" : `${formatCount(days)} días`;
}

/** La fracción como porcentaje. Lo hace `Intl`: acá no se multiplica nada. */
const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: PERCENT_DECIMALS,
});

export function formatFraction(fraction: number): string {
  return percentFormatter.format(fraction);
}

const decimalFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: DECIMAL_DIGITS });

/** Horas de desfase, coberturas fuera de escala y demás números sueltos. */
export function formatDecimal(value: number | null): string {
  return value === null ? MISSING_TEXT : decimalFormatter.format(value);
}

// Formato del tablero: dar forma a lo que ya vino, nunca calcularlo.
//
// Todo lo de acá es presentación pura. Ni un promedio, ni una suma, ni una
// resta: si un número no llegó del backend, no aparece en pantalla.
import { addDays, type DateRange } from "@/app/lib/analitica/dateRange";

const LOCALE = "es-CR";
const PERCENT_DECIMALS = 1;

/** La fracción como porcentaje. Lo hace `Intl`, así que acá no se multiplica
 * nada: es una regla de formato, no una cuenta. */
const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: PERCENT_DECIMALS,
});

export function formatFraction(fraction: number): string {
  return percentFormatter.format(fraction);
}

const DATE_LENGTH = 10;
const TIME_START = 11;
const TIME_END = 16;

/**
 * La marca de tiempo tal como está guardada.
 *
 * Los timestamps de la base vienen etiquetados `+00` pero guardan la hora LOCAL
 * de Costa Rica. Pasarlos por `Date` los correría seis horas, así que se cortan
 * como texto y no se interpretan nunca.
 */
export function formatLocalStamp(stamp: string): string {
  const day = stamp.slice(0, DATE_LENGTH);
  const time = stamp.slice(TIME_START, TIME_END);
  return time ? `${day}, ${time}` : day;
}

/** Un rango [desde, hasta) escrito con fechas INCLUSIVAS, que es como lo lee una
 * persona: el fin exclusivo `2026-06-02` se muestra como `2026-06-01`. */
export function formatInclusiveRange(range: Pick<DateRange, "from" | "toExclusive">): string {
  return `${range.from} a ${addDays(range.toExclusive, -1)}`;
}

/** El backend manda `kWh/kWp/ano` sin la eñe: se muestra bien escrito, y
 * cualquier unidad que no esté en la tabla viaja tal cual para no inventarla. */
const UNIT_LABEL: Readonly<Record<string, string>> = {
  "kWh/kWp/ano": "kWh/kWp/año",
};

export function formatUnit(unit: string): string {
  return UNIT_LABEL[unit] ?? unit;
}

export function formatDays(days: number): string {
  return days === 1 ? "1 día" : `${formatInteger(days)} días`;
}

const integerFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** Un conteo o una potencia nominal, con el separador de miles local. */
export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

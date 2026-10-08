// Qué días deja elegir el calendario, según lo que se sepa de la cobertura.
//
// Solo se restringe cuando la lista llegó bien: cargando, con error o con la
// base vacía, se puede elegir cualquier día y se dice por qué. Bloquear por una
// falla de red dejaría a la persona sin poder cambiar el rango.
//
// La otra fuente es una fecha mínima, para fechas que miran hacia adelante (la
// próxima revisión de una alerta): ahí los días con datos no dicen nada.
import { VERIFIED_COVERAGE } from "@/app/lib/analitica/coverage";
import { addDays, type IsoDate } from "@/app/lib/analitica/dateRange";
import type { DaysWithDataState } from "@/app/lib/analitica/useDaysWithData";
import { shiftMonths } from "@/app/lib/tiempo";

export type DayAvailability = {
  /** null = no se sabe qué días tienen datos, y entonces todos se eligen. */
  readonly selectableDays: ReadonlySet<string> | null;
  /** Primer día elegible; los anteriores quedan en gris. */
  readonly minDate?: IsoDate;
  /** Lo que se le dice a la persona bajo el calendario. */
  readonly note: string;
  /** Por qué un día no se elige, para el lector de pantalla: «sin datos». */
  readonly unavailableLabel: string;
};

const NO_DATA_LABEL = "sin datos";
const PAST_DAY_LABEL = "ya pasó";

export const AVAILABILITY_NOTE = {
  loading: "Cargando cobertura…",
  ready: "Los días en gris no tienen datos.",
  empty: "La base no informa días con datos: se puede elegir cualquier día.",
  error: "No se pudo saber qué días tienen datos: se puede elegir cualquier día.",
  fromDate: "Los días en gris ya pasaron.",
} as const;

/** De dónde salen los días elegibles: los que tienen datos, o todos desde una fecha. */
export type DaySource =
  | { readonly daysWithData: DaysWithDataState; readonly minDate?: never }
  | { readonly minDate: IsoDate; readonly daysWithData?: never };

/** Cuántos meses hacia adelante ofrece el salto rápido cuando no hay cobertura
 *  que lo acote: un año alcanza para agendar una revisión. */
const FORWARD_SPAN_MONTHS = 12;

export type CalendarSpan = { readonly first: IsoDate; readonly last: IsoDate };

/** Qué se puede elegir y qué meses ofrece el salto rápido, según la fuente. */
export function pickerDays(source: DaySource): { availability: DayAvailability; span: CalendarSpan } {
  if (source.minDate !== undefined) {
    return {
      availability: {
        selectableDays: null,
        minDate: source.minDate,
        note: AVAILABILITY_NOTE.fromDate,
        unavailableLabel: PAST_DAY_LABEL,
      },
      span: { first: source.minDate, last: shiftMonths(source.minDate, FORWARD_SPAN_MONTHS) },
    };
  }
  const { daysWithData } = source;
  const coverage = daysWithData.status === "ready" ? daysWithData.bounds : VERIFIED_COVERAGE;
  return {
    availability: dayAvailability(daysWithData),
    span: { first: coverage.from, last: addDays(coverage.toExclusive, -1) },
  };
}

export function dayAvailability(daysWithData: DaysWithDataState): DayAvailability {
  if (daysWithData.status === "ready") {
    return { selectableDays: daysWithData.days, note: AVAILABILITY_NOTE.ready, unavailableLabel: NO_DATA_LABEL };
  }
  return { selectableDays: null, note: AVAILABILITY_NOTE[daysWithData.status], unavailableLabel: NO_DATA_LABEL };
}

export function isSelectableDay(availability: DayAvailability, date: string): boolean {
  if (availability.minDate !== undefined && date < availability.minDate) return false;
  return availability.selectableDays === null || availability.selectableDays.has(date);
}

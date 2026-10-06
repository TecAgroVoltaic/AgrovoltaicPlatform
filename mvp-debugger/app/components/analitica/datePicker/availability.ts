// Qué días deja elegir el calendario, según lo que se sepa de la cobertura.
//
// Solo se restringe cuando la lista llegó bien: cargando, con error o con la
// base vacía, se puede elegir cualquier día y se dice por qué. Bloquear por una
// falla de red dejaría a la persona sin poder cambiar el rango.
import type { DaysWithDataState } from "@/app/lib/analitica/useDaysWithData";

export type DayAvailability = {
  /** null = no se sabe qué días tienen datos, y entonces todos se eligen. */
  readonly selectableDays: ReadonlySet<string> | null;
  /** Lo que se le dice a la persona bajo el calendario. */
  readonly note: string;
};

export const AVAILABILITY_NOTE = {
  loading: "Cargando cobertura…",
  ready: "Los días en gris no tienen datos.",
  empty: "La base no informa días con datos: se puede elegir cualquier día.",
  error: "No se pudo saber qué días tienen datos: se puede elegir cualquier día.",
} as const;

export function dayAvailability(daysWithData: DaysWithDataState): DayAvailability {
  if (daysWithData.status === "ready") {
    return { selectableDays: daysWithData.days, note: AVAILABILITY_NOTE.ready };
  }
  return { selectableDays: null, note: AVAILABILITY_NOTE[daysWithData.status] };
}

export function isSelectableDay(availability: DayAvailability, date: string): boolean {
  return availability.selectableDays === null || availability.selectableDays.has(date);
}

// El contrato de `GET /analitica/dias-con-datos`: qué días de calendario traen
// al menos una lectura. Lo usa el calendario del rango para no dejar elegir un
// día vacío.
//
// Es METADATO (como el catálogo de variables): no viaja en el sobre de
// `resultado`. Las fechas son `YYYY-MM-DD` en hora del sitio y `hasta` es
// EXCLUSIVO, la misma convención que el rango de la URL. Sin ningún dato en la
// base, `desde`/`hasta` llegan en null y la lista vacía: eso no es un error, es
// "sin cobertura", y se modela así para que nadie lo confunda con un fallo.
import { z } from "zod";

import { isIsoDate, type DateRange, type IsoDate } from "@/app/lib/analitica/dateRange";

/** Ventana [from, toExclusive) que de verdad tiene datos. */
export type CoverageBounds = Pick<DateRange, "from" | "toExclusive">;

export type DaysWithData = {
  /** null cuando la base no tiene ni un día con datos. */
  readonly bounds: CoverageBounds | null;
  /** Días con al menos una lectura de cualquier fuente, ordenados. */
  readonly days: readonly IsoDate[];
  readonly daysBySource: {
    readonly electrical: readonly IsoDate[];
    readonly radiation: readonly IsoDate[];
  };
};

const isoDateSchema = z.string().refine(isIsoDate, { message: "fecha fuera del formato AAAA-MM-DD" });

export const daysWithDataSchema = z
  .object({
    desde: isoDateSchema.nullable(),
    hasta: isoDateSchema.nullable(),
    n_dias: z.number().int().nonnegative(),
    dias: z.array(isoDateSchema),
    fuentes: z.object({
      electrico: z.array(isoDateSchema),
      radiacion: z.array(isoDateSchema),
    }),
  })
  .refine((raw) => (raw.desde === null) === (raw.hasta === null), {
    message: "«desde» y «hasta» vienen los dos o ninguno",
  })
  .transform(
    (raw): DaysWithData => ({
      bounds: raw.desde !== null && raw.hasta !== null ? { from: raw.desde, toExclusive: raw.hasta } : null,
      days: raw.dias,
      daysBySource: { electrical: raw.fuentes.electrico, radiation: raw.fuentes.radiacion },
    }),
  );

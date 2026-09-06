// Contratos del detalle: `GET /calidad/dias`, `GET /calidad/hallazgos` y el
// glosario de tipos que publica `GET /arquitectura`.
import { z } from "zod";

import { dayVerdictSchema, severitySchema } from "@/app/lib/analitica/contracts/calidadCommon";

// ── GET /calidad/dias ────────────────────────────────────────────────────────

const daySchema = z
  .object({
    fecha: z.string(),
    filas_radiacion: z.number(),
    filas_electrico: z.number(),
    graves_rad: z.number(),
    avisos_rad: z.number(),
    graves_ele: z.number(),
    avisos_ele: z.number(),
    lecturas_sin_acoplar: z.number(),
    parada_bajo_sol: z.boolean(),
    planta_parada: z.boolean(),
    clase: z.string().nullish(),
    veredicto: dayVerdictSchema,
    veredicto_radiacion: dayVerdictSchema,
    veredicto_electrico: dayVerdictSchema,
  })
  .transform((raw) => ({
    date: raw.fecha,
    verdict: raw.veredicto,
    radiation: { rows: raw.filas_radiacion, critical: raw.graves_rad, warnings: raw.avisos_rad },
    electrical: { rows: raw.filas_electrico, critical: raw.graves_ele, warnings: raw.avisos_ele },
    plantStopped: raw.planta_parada,
    stoppedUnderSun: raw.parada_bajo_sol,
    unpairedReadings: raw.lecturas_sin_acoplar,
    skyClass: raw.clase ?? null,
  }));

export type QualityDay = z.infer<typeof daySchema>;

export const qualityDaysSchema = z
  .object({ dias: z.array(daySchema) })
  .transform((raw): readonly QualityDay[] => raw.dias);

// ── GET /calidad/hallazgos ───────────────────────────────────────────────────

const findingSchema = z
  .object({
    fecha: z.string(),
    fuente: z.string(),
    variable: z.string().nullish(),
    tipo: z.string(),
    severidad: severitySchema,
    n_afectadas: z.number().nullish(),
    detalle: z.record(z.string(), z.unknown()).nullish(),
    que_es: z.string(),
  })
  .transform((raw) => ({
    date: raw.fecha,
    source: raw.fuente,
    variable: raw.variable ?? null,
    type: raw.tipo,
    severity: raw.severidad,
    affected: raw.n_afectadas ?? null,
    detail: raw.detalle ?? {},
    whatItIs: raw.que_es,
  }));

export type Finding = z.infer<typeof findingSchema>;

/** La página servida. `nextOffset` en null significa que era la última. */
const paginationSchema = z
  .object({
    offset: z.number(),
    limite: z.number(),
    hay_mas: z.boolean(),
    siguiente_offset: z.number().nullish(),
  })
  .transform((raw) => ({
    offset: raw.offset,
    limit: raw.limite,
    hasMore: raw.hay_mas,
    nextOffset: raw.siguiente_offset ?? null,
  }));

export const findingsPageSchema = z
  .object({
    // `total` es el del FILTRO, no el de la página: se muestra AL LADO de
    // cuántos se devolvieron, nunca en su lugar.
    total: z.number(),
    devueltos: z.number(),
    truncado: z.boolean(),
    pagina: paginationSchema,
    // El orden es total por la primary key `(fecha, fuente, variable, tipo)`.
    // Viaja a la pantalla porque es lo que hace fiable pasar de página: con un
    // orden ambiguo, paginar repite un hallazgo y se salta otro en silencio.
    orden: z.string(),
    hallazgos: z.array(findingSchema),
  })
  .transform((raw) => ({
    total: raw.total,
    returned: raw.devueltos,
    truncated: raw.truncado,
    page: raw.pagina,
    order: raw.orden,
    findings: raw.hallazgos,
  }));

export type FindingsPage = z.infer<typeof findingsPageSchema>;

// ── GET /arquitectura (solo el glosario) ─────────────────────────────────────

/** Qué significa cada uno de los 30 tipos, en las palabras del servicio. */
export type FindingGlossary = ReadonlyMap<string, string>;

export const findingGlossarySchema = z
  .object({
    hallazgos: z.object({
      tipos: z.array(z.object({ tipo: z.string(), que_es: z.string() })),
    }),
  })
  .transform(
    (raw): FindingGlossary => new Map(raw.hallazgos.tipos.map((row) => [row.tipo, row.que_es])),
  );

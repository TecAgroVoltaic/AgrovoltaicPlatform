// Contrato de `GET /calidad/resumen`: el veredicto (en `calidadVerdict.ts`), el
// desglose por tipo de hallazgo y el bloque de vigilancia.
import { z } from "zod";

import { severitySchema } from "@/app/lib/analitica/contracts/calidadCommon";
import { qualityBlockSchema } from "@/app/lib/analitica/contracts/calidadVerdict";

const findingTypeSchema = z
  .object({
    fuente: z.string(),
    tipo: z.string(),
    severidad: severitySchema,
    dias: z.number(),
    variables: z.number(),
    lecturas: z.number().nullish(),
    primer_dia: z.string().nullish(),
    ultimo_dia: z.string().nullish(),
  })
  .transform((raw) => ({
    source: raw.fuente,
    type: raw.tipo,
    severity: raw.severidad,
    days: raw.dias,
    variables: raw.variables,
    readings: raw.lecturas ?? null,
    firstDay: raw.primer_dia ?? null,
    lastDay: raw.ultimo_dia ?? null,
  }));

export type FindingTypeRow = z.infer<typeof findingTypeSchema>;

/** Por qué el barrido no revisa una variable. Los cuatro motivos NO dicen lo
 * mismo, y el servicio los define uno por uno en `vigilance.note`: mostrarlos
 * como una sola categoría afirma algo falso. */
const unwatchedReasonSchema = z.enum([
  "columna_no_barrida",
  "fuente_sin_denominador",
  "variable_derivada",
  "sin_fuente_en_la_base",
]);

export type UnwatchedReason = z.infer<typeof unwatchedReasonSchema>;

const unwatchedSchema = z
  .object({
    clave: z.string(),
    familia: z.string(),
    fuente: z.string().nullish(),
    motivo: unwatchedReasonSchema,
    hallazgos_en_el_periodo: z.number(),
    cuentan_para_el_veredicto: z.boolean(),
  })
  .transform((raw) => ({
    key: raw.clave,
    family: raw.familia,
    source: raw.fuente ?? null,
    reason: raw.motivo,
    findingsInPeriod: raw.hallazgos_en_el_periodo,
    // Campo aparte de `findingsInPeriod` A PROPÓSITO: una variable puede
    // acumular mil hallazgos y que ninguno pese jamás en el veredicto.
    countsForVerdict: raw.cuentan_para_el_veredicto,
  }));

export type UnwatchedVariable = z.infer<typeof unwatchedSchema>;

const vigilanceSchema = z
  .object({
    vigiladas: z.array(z.string()),
    sin_vigilancia: z.array(unwatchedSchema),
    fuentes_del_veredicto: z.array(z.string()),
    nota: z.string(),
  })
  .transform((raw) => ({
    watched: raw.vigiladas,
    unwatched: raw.sin_vigilancia,
    verdictSources: raw.fuentes_del_veredicto,
    note: raw.nota,
  }));

export type Vigilance = z.infer<typeof vigilanceSchema>;

export const qualitySummarySchema = z
  .object({
    calidad: qualityBlockSchema,
    tipos: z.array(findingTypeSchema),
    vigilancia: vigilanceSchema,
  })
  .transform((raw) => ({
    verdict: raw.calidad.verdict,
    note: raw.calidad.note,
    topProblems: raw.calidad.topProblems,
    types: raw.tipos,
    vigilance: raw.vigilancia,
  }));

export type QualitySummary = z.infer<typeof qualitySummarySchema>;

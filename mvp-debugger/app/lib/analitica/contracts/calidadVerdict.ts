// El veredicto del período dentro de `GET /calidad/resumen`: los DOS ejes y el
// ranking de problemas que el servicio ya trae calculado.
//
// Vive aparte del resto del resumen porque es lo único que la vista enseña de
// entrada: la tabla por tipo y la vigilancia son detalle, y mezclarlos en un
// archivo dejaba 170 líneas donde no se veía cuál era cuál.
import { z } from "zod";

import { severitySchema } from "@/app/lib/analitica/contracts/calidadCommon";

/** El eje del EQUIPO, que el servicio manda separado del eje del DATO. */
const availabilitySchema = z
  .object({
    dias_con_planta_parada: z.number(),
    dias_parada_bajo_sol: z.number(),
    de_dias_con_datos: z.number(),
    fraccion: z.number().nullish(),
    advertencia: z.string().nullish(),
    nota: z.string(),
  })
  .transform((raw) => ({
    stoppedDays: raw.dias_con_planta_parada,
    stoppedUnderSunDays: raw.dias_parada_bajo_sol,
    ofDaysWithData: raw.de_dias_con_datos,
    fraction: raw.fraccion ?? null,
    warning: raw.advertencia ?? null,
    note: raw.nota,
  }));

export type EquipmentAvailability = z.infer<typeof availabilitySchema>;

/** `cobertura` es `dias_utilizables / dias_en_rango`, ya dividido por el
 * servicio: la vista la dibuja tal cual y no vuelve a dividir nada. */
const usabilitySchema = z.object({ dias_utilizables: z.number(), cobertura: z.number() });

const verdictSchema = z
  .object({
    dias_en_rango: z.number(),
    dias_con_datos: z.number(),
    dias_utilizables: z.number(),
    cobertura: z.number(),
    advertencia: z.string().nullish(),
    medido_sobre: z.array(z.string()),
    disponibilidad: availabilitySchema,
    // Ausente cuando el período no tiene ni un día con datos.
    por_variable: z.record(z.string(), usabilitySchema).optional(),
  })
  .transform((raw) => ({
    daysInRange: raw.dias_en_rango,
    daysWithData: raw.dias_con_datos,
    usableDays: raw.dias_utilizables,
    coverage: raw.cobertura,
    warning: raw.advertencia ?? null,
    measuredOver: raw.medido_sobre,
    availability: raw.disponibilidad,
    byVariable: Object.entries(raw.por_variable ?? {}).map(([variable, own]) => ({
      variable,
      usableDays: own.dias_utilizables,
      coverage: own.cobertura,
    })),
  }));

export type QualityVerdict = z.infer<typeof verdictSchema>;
export type VariableUsability = QualityVerdict["byVariable"][number];

/** El ranking que el servicio ya ordenó por días afectados. La vista lo enseña
 * de entrada para responder "¿hay algo grave?" sin abrir las 133 filas por
 * tipo, y no lo recalcula: llega hecho. */
const topProblemSchema = z
  .object({
    tipo: z.string(),
    severidad: severitySchema,
    dias: z.number(),
    variables: z.number(),
    lecturas: z.number().nullish(),
  })
  .transform((raw) => ({
    type: raw.tipo,
    severity: raw.severidad,
    days: raw.dias,
    variables: raw.variables,
    readings: raw.lecturas ?? null,
  }));

export type TopProblem = z.infer<typeof topProblemSchema>;

export const qualityBlockSchema = z
  .object({
    veredicto: verdictSchema,
    nota: z.string(),
    // Vacío cuando el período no registró un solo hallazgo.
    problemas_mas_frecuentes: z.array(topProblemSchema).default([]),
  })
  .transform((raw) => ({
    verdict: raw.veredicto,
    note: raw.nota,
    topProblems: raw.problemas_mas_frecuentes,
  }));

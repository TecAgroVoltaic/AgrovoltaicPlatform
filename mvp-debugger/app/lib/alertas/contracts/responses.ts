// Las respuestas de `/alertas/*` que envuelven alertas: página, resumen,
// detalle, evaluación y acción.
import { z } from "zod";

import type { AlertStatus } from "@/app/lib/alertas/vocabulary";

import { alertEventSchema, alertSchema } from "./alert";
import { countSchema, internalPathSchema } from "./fields";

export const alertsPageSchema = z
  .object({
    total: z.number().int().nonnegative(),
    pagina: z.object({
      offset: z.number().int().nonnegative(),
      limite: z.number().int().positive(),
      hay_mas: z.boolean(),
      siguiente_offset: z.number().int().nonnegative().nullable(),
    }),
    alertas: z.array(alertSchema),
  })
  .transform((raw) => ({
    total: raw.total,
    page: {
      offset: raw.pagina.offset,
      limit: raw.pagina.limite,
      hasMore: raw.pagina.hay_mas,
      nextOffset: raw.pagina.siguiente_offset,
    },
    alerts: raw.alertas,
  }));

export type AlertsPage = z.infer<typeof alertsPageSchema>;

export const alertsSummarySchema = z
  .object({
    por_estado: z.object({
      nueva: countSchema,
      reconocida: countSchema,
      en_seguimiento: countSchema,
      resuelta: countSchema,
      descartada: countSchema,
    }),
    abiertas_graves: countSchema,
    abiertas_total: countSchema,
    // Nulo si el evaluador nunca corrió: una lista vacía no significa lo mismo
    // en ese caso, y la vista lo tiene que poder decir.
    ultima_evaluacion: z.string().nullable(),
  })
  .transform((raw) => ({
    // Conteos de TODA la tabla, no del período: el resumen no recibe rango.
    byStatus: {
      new: raw.por_estado.nueva,
      acknowledged: raw.por_estado.reconocida,
      tracking: raw.por_estado.en_seguimiento,
      resolved: raw.por_estado.resuelta,
      dismissed: raw.por_estado.descartada,
    } satisfies Record<AlertStatus, number>,
    openCritical: raw.abiertas_graves,
    openTotal: raw.abiertas_total,
    lastEvaluation: raw.ultima_evaluacion,
  }));

export type AlertsSummary = z.infer<typeof alertsSummarySchema>;

export const alertDetailSchema = z
  .object({
    alerta: alertSchema,
    eventos: z.array(alertEventSchema),
    que_es: z.string(),
    enlaces: z.object({ calidad: internalPathSchema, series: internalPathSchema }),
  })
  .transform((raw) => ({
    alert: raw.alerta,
    events: raw.eventos,
    whatItIs: raw.que_es,
    links: { quality: raw.enlaces.calidad, series: raw.enlaces.series },
  }));

export type AlertDetail = z.infer<typeof alertDetailSchema>;

/** `POST /alertas/evaluar`. `advertencia` llega cuando no había hallazgos que
 *  recorrer: cero creadas por eso no es lo mismo que cero porque todo está bien. */
export const evaluationResultSchema = z
  .object({
    creadas: countSchema,
    actualizadas: countSchema,
    revisadas: countSchema,
    advertencia: z.string().optional(),
  })
  .transform((raw) => ({
    created: raw.creadas,
    updated: raw.actualizadas,
    reviewed: raw.revisadas,
    warning: raw.advertencia ?? null,
  }));

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export const alertActionResponseSchema = z
  .object({ alerta: alertSchema })
  .transform((raw) => raw.alerta);


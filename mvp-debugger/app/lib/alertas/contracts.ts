// Contratos de `/alertas/*` (docs/referencia/contratos-asistente-alertas.md §4.5).
// Se valida en la frontera y se traduce a inglés acá, una sola vez: ningún
// componente sabe que el backend dice `en_seguimiento`.
//
// Pasa de 150 líneas a propósito: es UN contrato (el de §4.5) y partirlo por
// endpoint repartiría `alertSchema`, que usan cuatro de las cinco respuestas.
import { z } from "zod";

import { isIsoDate } from "@/app/lib/analitica/dateRange";
import {
  EVENT_TYPE_FROM_WIRE,
  SEVERITY_FROM_WIRE,
  STATUS_FROM_WIRE,
  type AlertStatus,
  type WireReader,
} from "@/app/lib/alertas/vocabulary";

function closedWord<TKey extends string>(reader: WireReader<TKey>, what: string) {
  return z.string().transform((wire, ctx): TKey => {
    const key = reader.get(wire);
    if (key === undefined) {
      ctx.addIssue({ code: "custom", message: `${what} desconocido: ${wire}` });
      return z.NEVER;
    }
    return key;
  });
}

const isoDateSchema = z.string().refine(isIsoDate, { message: "fecha fuera de formato AAAA-MM-DD" });

/** Solo rutas internas: un enlace del backend nunca puede sacar de la consola
 *  (`//otro.sitio`) ni ejecutar código (`javascript:`). */
const internalPathSchema = z
  .string()
  .refine((path) => path.startsWith("/") && !path.startsWith("//"), {
    message: "el enlace no es una ruta interna",
  });

const evidenceFindingSchema = z
  .object({ fecha: z.string(), fuente: z.string(), variable: z.string(), tipo: z.string() })
  .transform((raw) => ({
    date: raw.fecha,
    source: raw.fuente,
    variable: raw.variable,
    type: raw.tipo,
  }));

// Cada clave con valor por defecto: la columna nace como `'{}'` y el contrato
// solo garantiza estas tres «al menos», no siempre.
const evidenceSchema = z
  .object({
    fechas: z.array(z.string()).default([]),
    hallazgos: z.array(evidenceFindingSchema).default([]),
    // Las cifras dependen de la regla que disparó la alerta: se dejan abiertas y
    // la ficha las muestra tal cual, sin interpretarlas.
    cifras: z.record(z.string(), z.unknown()).default({}),
  })
  .transform((raw) => ({ dates: raw.fechas, findings: raw.hallazgos, figures: raw.cifras }));

export const alertSchema = z
  .object({
    id: z.number().int(),
    clave: z.string(),
    tipo: z.string(),
    severidad: closedWord(SEVERITY_FROM_WIRE, "gravedad"),
    estado: closedWord(STATUS_FROM_WIRE, "estado"),
    titulo: z.string(),
    descripcion: z.string(),
    fuente: z.string(),
    variable: z.string(),
    fecha_inicio: isoDateSchema,
    fecha_fin: isoDateSchema,
    ocurrencias: z.number().int().nonnegative(),
    evidencia: evidenceSchema,
    proxima_revision: isoDateSchema.nullable(),
    creada_en: z.string(),
    actualizada_en: z.string(),
    ultima_ocurrencia_en: z.string(),
  })
  .transform((raw) => ({
    id: raw.id,
    key: raw.clave,
    type: raw.tipo,
    severity: raw.severidad,
    status: raw.estado,
    title: raw.titulo,
    description: raw.descripcion,
    source: raw.fuente,
    variable: raw.variable,
    firstDate: raw.fecha_inicio,
    lastDate: raw.fecha_fin,
    occurrences: raw.ocurrencias,
    evidence: raw.evidencia,
    nextReview: raw.proxima_revision,
    createdAt: raw.creada_en,
    updatedAt: raw.actualizada_en,
    lastOccurrenceAt: raw.ultima_ocurrencia_en,
  }));

export type Alert = z.infer<typeof alertSchema>;

export const alertEventSchema = z
  .object({
    id: z.number().int(),
    tipo: closedWord(EVENT_TYPE_FROM_WIRE, "tipo de evento"),
    nota: z.string().nullable(),
    autor: z.string(),
    datos: z.record(z.string(), z.unknown()).default({}),
    creado_en: z.string(),
  })
  .transform((raw) => ({
    id: raw.id,
    type: raw.tipo,
    note: raw.nota,
    author: raw.autor,
    data: raw.datos,
    createdAt: raw.creado_en,
  }));

export type AlertEvent = z.infer<typeof alertEventSchema>;

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

const countSchema = z.number().int().nonnegative();

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

// ── Conflictos (409) ─────────────────────────────────────────────────────────
// El backend responde `{detail: "<prosa>", codigo, ...datos}` (historico.errores):
// `codigo` es lo estable, `detail` cambia. Se acepta además el objeto envuelto
// en `detail`, que es como lo serializa un `HTTPException` de FastAPI.

const invalidTransitionBodySchema = z
  .object({ codigo: z.literal("transicion_invalida"), de: z.string(), a: z.string() })
  .transform((raw) => ({
    kind: "invalidTransition" as const,
    from: STATUS_FROM_WIRE.get(raw.de) ?? null,
    to: STATUS_FROM_WIRE.get(raw.a) ?? null,
  }));

const openAlertExistsBodySchema = z
  .object({
    codigo: z.literal("alerta_abierta_existente"),
    abierta_id: z.number().int().nullable().optional(),
  })
  .transform((raw) => ({ kind: "openAlertExists" as const, openAlertId: raw.abierta_id ?? null }));

const conflictBodySchema = z.union([invalidTransitionBodySchema, openAlertExistsBodySchema]);

/** Los dos 409 del contrato: la alerta cambió de estado, o reabrirla chocaría
 *  con otra abierta por la misma causa (misma `clave`). */
export const alertConflictSchema = z.union([
  conflictBodySchema,
  z.object({ detail: conflictBodySchema }).transform((raw) => raw.detail),
]);

export type AlertConflict = z.infer<typeof alertConflictSchema>;

// La alerta y su evento, tal como llegan en casi todas las respuestas de
// `/alertas/*`, traducidos a inglés.
import { z } from "zod";

import { EVENT_TYPE_FROM_WIRE, SEVERITY_FROM_WIRE, STATUS_FROM_WIRE } from "@/app/lib/alertas/vocabulary";

import { closedWord, isoDateSchema } from "./fields";

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

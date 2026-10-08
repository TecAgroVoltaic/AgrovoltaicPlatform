import { z } from "zod";

import { wholeDays } from "@/app/lib/analitica/contracts/primitives";

/** Qué tan viejo es el último dato. `stopped` es una alerta, no un dato neutro. */
export type FreshnessState = "up_to_date" | "lagging" | "stopped" | "no_data";

export type Freshness = {
  readonly state: FreshnessState;
  /** Marca del último registro. Es hora LOCAL de Costa Rica pese al `+00`. */
  readonly lastDataAt: string | null;
  readonly ageDays: number | null;
  readonly alarmingThresholdDays: number;
  /** Texto ya redactado por el backend, solo cuando el sistema se detuvo. */
  readonly message: string | null;
};

const FRESHNESS_BY_WIRE = {
  al_dia: "up_to_date",
  rezagada: "lagging",
  detenida: "stopped",
  sin_datos: "no_data",
} as const satisfies Readonly<Record<string, FreshnessState>>;

export const freshnessSchema = z
  .object({
    ultimo_dato: z.string().nullish(),
    antiguedad_dias: z.number().int().nullish(),
    estado: z.enum(["al_dia", "rezagada", "detenida", "sin_datos"]),
    umbral_alarmante_dias: wholeDays,
    mensaje: z.string().nullish(),
  })
  .transform((raw): Freshness => ({
    state: FRESHNESS_BY_WIRE[raw.estado],
    lastDataAt: raw.ultimo_dato ?? null,
    ageDays: raw.antiguedad_dias ?? null,
    alarmingThresholdDays: raw.umbral_alarmante_dias,
    message: raw.mensaje ?? null,
  }));

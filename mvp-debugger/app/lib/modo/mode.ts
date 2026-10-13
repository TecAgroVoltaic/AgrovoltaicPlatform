// El modo de la consola (contrato §7): `simple` es el chat limpio en `/`;
// `avanzado`, la consola con barra lateral que arranca en el tablero.
//
// La preferencia vive en una cookie y no en localStorage porque la lee el
// SERVIDOR antes de pintar: así `/` redirige al tablero sin mostrar un instante
// el chat. Puro: sin React ni `next/headers`, lo usan el servidor y el cliente.
import { z } from "zod";

import { INICIO_PATH, TABLERO_PATH } from "@/app/lib/navegacion/paths";

export const MODE_COOKIE = "av_modo";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

const modeSchema = z.enum(["simple", "avanzado"]);
export type Mode = z.infer<typeof modeSchema>;

/** Sin cookie (o con una ilegible) se entra en simple: es la decisión del producto. */
export const DEFAULT_MODE: Mode = "simple";

/** Dónde aterriza cada modo al elegirlo. */
export const MODE_HOME: Readonly<Record<Mode, string>> = {
  simple: INICIO_PATH,
  avanzado: TABLERO_PATH,
};

export function parseMode(raw: string | null | undefined): Mode {
  const parsed = modeSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_MODE;
}

/** La cookie lista para `document.cookie`: un año, toda la app, sin salir del sitio. */
export function serializeModeCookie(mode: Mode): string {
  return `${MODE_COOKIE}=${mode}; Path=/; Max-Age=${ONE_YEAR_S}; SameSite=Lax`;
}

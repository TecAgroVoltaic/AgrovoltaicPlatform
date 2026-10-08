import { nfmt } from "@/app/lib/client";
import { instanteEnSitio } from "@/app/lib/tiempo";

const HORAS_POR_DIA = 24;
const MINUTOS_POR_HORA = 60;
/** Largo máximo de un detalle de error en pantalla. */
export const MAX_DETALLE = 160;

export const TEXTO_ESTADO: Record<string, string> = {
  ok: "Al día", stale: "Datos viejos", sin_datos: "Sin datos", desconocido: "Sin medir",
};

export function edad(horas: number | null | undefined): string {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.round(horas * MINUTOS_POR_HORA)} min`;
  if (horas < HORAS_POR_DIA) return `${nfmt(horas, 1)} h`;
  return `${nfmt(horas / HORAS_POR_DIA, 1)} días`;
}

export const fecha = instanteEnSitio;

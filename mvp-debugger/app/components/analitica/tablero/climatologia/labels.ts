// Los textos de la climatología mensual. Viven juntos para que el título de un
// panel, su motivo de vacío y su unidad no se repitan escritos a mano.
import type { BoxesBlock, ClimatologyEmptyReason } from "@/app/lib/analitica/contracts/climatologia";

export const CLIMATOLOGY_PATH = "analitica/climatologia";
export const CLIMATOLOGY_TITLE = "Climatología mensual";

export const PANEL_TITLE = {
  irradiation: "Irradiación total por mes",
  irradiance: "Irradiancia por mes",
  temperature: "Temperatura ambiente por mes",
  humidity: "Humedad del aire por mes",
} as const;

export type BoxPanelId = Exclude<keyof typeof PANEL_TITLE, "irradiation">;

type ReasonText = { readonly message: string; readonly hint?: string };

export const EMPTY_REASON_TEXT: Readonly<Record<ClimatologyEmptyReason, ReasonText>> = {
  sin_datos: { message: "No hay lecturas de esta variable en el rango." },
  agrodash_no_disponible: {
    message: "AgroDash no respondió.",
    hint: "Es un servicio externo: probá de nuevo en unos minutos.",
  },
};

export const NO_MONTHS_MESSAGE = "El rango no abarca ningún mes con datos.";

/** El backend escribe las unidades en ASCII; se muestran bien escritas. Una
 *  unidad que no esté acá viaja tal cual para no inventarla. */
const UNIT_LABEL: Readonly<Record<string, string>> = {
  "kWh/m2": "kWh/m²",
  "W/m2": "W/m²",
  C: "°C",
};

export function displayUnit(unit: string): string {
  return UNIT_LABEL[unit] ?? unit;
}

const LOCALE = "es-CR";
const SUBTITLE_SEPARATOR = " · ";

/** «base: medias diarias», solo cuando el backend la declara. */
export function basisSubtitle(basis: string | null): string | undefined {
  return basis ? `base: ${basis}` : undefined;
}

/**
 * La base, las cajas de sensores y cuántas muestras resumen las cajas del
 * período. Ese total es la suma de los `n` que manda el backend, no una cuenta
 * nueva: con las cajas ambientales casi vacías, es lo que explica por qué el
 * panel se ve hueco.
 */
export function boxesSubtitle(block: BoxesBlock | null): string | undefined {
  if (!block) return undefined;
  const samples = block.boxes.reduce((total, box) => total + box.count, 0);
  const parts = [
    basisSubtitle(block.basis),
    block.sensorBoxes.length > 0 ? block.sensorBoxes.join(", ") : undefined,
    block.reason ? undefined : `n = ${samples.toLocaleString(LOCALE)} en el período`,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(SUBTITLE_SEPARATOR) : undefined;
}

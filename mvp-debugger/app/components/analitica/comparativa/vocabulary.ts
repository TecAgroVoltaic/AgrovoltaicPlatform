// Cómo se nombra en pantalla lo que el cable manda en clave.
//
// «PV1» y «PV2» a secas no dicen nada y encima invitan a confundirlos: lo que
// cambia entre los dos arreglos es la GEOMETRÍA, y es justo lo que explica que
// produzcan distinto con la misma potencia pico.
//
// La tabla de arreglos es gemela de la de `tablero/arrays.ts` y no se importa a
// propósito: aquella indexa por `tilted`/`vertical` y este endpoint por
// `inclinado`/`vertical`, así que hacer puente costaría una búsqueda que puede
// fallar en silencio si el otro equipo reordena su lista. Queda anotado como
// deuda: el día que esta vocabulario viva en `lib/analitica`, se borra de las dos.
import type {
  ArrayKey,
  EnergySource,
  IrradianceInput,
} from "@/app/lib/analitica/contracts/comparativa";

/** Los dos arreglos, en el orden en que los nombra el documento. */
export const ARRAY_KEYS: readonly ArrayKey[] = ["inclinado", "vertical"];

export const ARRAY_LABEL: Readonly<Record<ArrayKey, string>> = {
  inclinado: "Inclinado (PV1)",
  vertical: "Vertical (PV2)",
};

export const ARRAY_GEOMETRY: Readonly<Record<ArrayKey, string>> = {
  inclinado: "20° de inclinación, azimut 150°",
  vertical: "90° de inclinación, azimut 50°",
};

/** Potencia pico de CADA arreglo: 4 módulos bifaciales de 355 Wp. */
export const ARRAY_PEAK_POWER_WP = 1420;

/** De dónde sale la energía del día. Los dos caminos NO se mezclan nunca. */
export const SOURCE_LABEL: Readonly<Record<EnergySource, string>> = {
  contador: "Contador",
  integral: "Integral",
};

export const SOURCE_DESCRIPTION: Readonly<Record<EnergySource, string>> = {
  contador: "acumulador diario del inversor",
  integral: "integral de la potencia medida",
};

/** Contra qué irradiancia se juzga cada arreglo. */
export const INPUT_LABEL: Readonly<Record<IrradianceInput, string>> = {
  ghi: "GHI horizontal",
  poa_bifacial: "POA bifacial",
  poa_frontal: "POA frontal",
};

export const INPUT_DESCRIPTION: Readonly<Record<IrradianceInput, string>> = {
  ghi: "irradiancia horizontal medida, sin modelo de por medio",
  poa_bifacial: "plano del arreglo con el aporte de la cara trasera, modelado",
  poa_frontal: "plano del arreglo solo por la cara frontal, modelado",
};

/** Los motivos de descarte que manda el backend, en prosa. */
export const DISCARD_REASON_LABEL: Readonly<Record<string, string>> = {
  cobertura_insuficiente: "cobertura insuficiente",
  desfase_excesivo: "desfase entre radiación y eléctrico",
};

export function describeDiscardReason(reason: string): string {
  return DISCARD_REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
}

/** Los motivos de ausencia que manda el backend, en prosa. El contrato compartido
 *  de métrica se queda con el código y descarta la explicación larga. */
export const MISSING_REASON_LABEL: Readonly<Record<string, string>> = {
  sin_lecturas: "no hay ni una lectura de esta variable en la ventana pedida",
  fuera_de_cobertura: "la ventana cae fuera del tramo en que esta variable es válida",
};

export function describeMissingReason(reason: string | null): string {
  if (!reason) return "el servicio no dijo por qué";
  return MISSING_REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
}

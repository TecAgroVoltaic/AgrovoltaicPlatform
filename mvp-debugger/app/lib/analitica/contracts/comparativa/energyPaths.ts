import { z } from "zod";

/** Por qué los dos caminos de energía NUNCA se funden en el mismo número: el
 *  contador cubre menos de la mitad de los días válidos y su subconjunto no
 *  representa el año. Los dos textos vienen redactados del backend.
 *
 *  `warning` es null cuando el contador cubre TODOS los días válidos: ahí no hay
 *  nada que advertir. Ausencia de aviso, no aviso vacío. */
export type EnergyPaths = {
  readonly warning: string | null;
  readonly counterUnitNote: string;
};

export const energyPathsSchema = z
  .object({ advertencia: z.string().nullish(), unidad_contador: z.string() })
  .transform((raw): EnergyPaths => ({
    warning: raw.advertencia ?? null,
    counterUnitNote: raw.unidad_contador,
  }));

// Piezas del cable compartidas por `analitica/comparativa` y `analitica/rendimiento`.
//
// Los tokens del cable (`contador`, `poa_frontal`, `inclinado`) NO se traducen a
// inglés: el backend los concatena en rutas como `"contador/poa_frontal/vertical"`
// para marcar qué variante supera el límite físico, y traducir las claves
// obligaría a destraducir esas rutas en cada comparación. Los NOMBRES de campo sí
// van en inglés; lo que se conserva son los VALORES que manda el servicio.
import { z } from "zod";

import { wholeDays } from "@/app/lib/analitica/contracts/primitives";

export { wholeDays };

export type EnergySource = "contador" | "integral";
export type IrradianceInput = "ghi" | "poa_bifacial" | "poa_frontal";
export type ArrayKey = "inclinado" | "vertical";
/** Cómo el backend nombra una celda de la matriz cuando la marca. */
export type VariantPath = `${EnergySource}/${IrradianceInput}/${ArrayKey}`;

export const inputEnum = z.enum(["ghi", "poa_bifacial", "poa_frontal"]);
export const nullableNumber = z.number().nullish();

export const byArray = <TCell extends z.ZodTypeAny>(cell: TCell) =>
  z.object({ inclinado: cell, vertical: cell });
export const byInput = <TPair extends z.ZodTypeAny>(pair: TPair) =>
  z.object({ ghi: pair, poa_bifacial: pair, poa_frontal: pair });
export const bySource = <TRow extends z.ZodTypeAny>(row: TRow) =>
  z.object({ contador: row, integral: row });

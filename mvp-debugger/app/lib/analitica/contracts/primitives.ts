import { z } from "zod";

/** Un conteo del cable (días, lecturas): entero y nunca negativo. */
export const wholeDays = z.number().int().nonnegative();

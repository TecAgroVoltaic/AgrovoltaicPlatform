import { z } from "zod";

/** Cómo se supo la cadencia contra la que se midió lo esperado. `nominal` avisa
 *  de que el período no tenía ni una fila con la que medirla. */
export type CadenceOrigin = "measured" | "nominal";

export const cadenceOriginSchema = z
  .enum(["medida", "nominal"])
  .transform((raw): CadenceOrigin => (raw === "medida" ? "measured" : "nominal"));

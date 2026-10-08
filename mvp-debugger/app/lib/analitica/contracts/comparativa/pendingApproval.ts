import { z } from "zod";

import { inputEnum, type IrradianceInput } from "@/app/lib/analitica/contracts/comparativa/shared";

/** R2: la ecuación de transposición todavía la tiene que confirmar Hugo. */
export type PendingApproval = {
  readonly provisionalInputs: readonly IrradianceInput[];
  readonly approver: string;
  readonly reference: string;
  readonly detail: string;
};

export const pendingApprovalSchema = z
  .object({
    insumos_provisionales: z.array(inputEnum),
    quien: z.string(),
    referencia: z.string(),
    detalle: z.string(),
  })
  .transform((raw): PendingApproval => ({
    provisionalInputs: raw.insumos_provisionales,
    approver: raw.quien,
    reference: raw.referencia,
    detail: raw.detalle,
  }));

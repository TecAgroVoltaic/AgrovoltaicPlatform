// Barril de los contratos de la vista Estadística: las cuatro respuestas que
// pinta, ya validadas en la frontera y traducidas al inglés una sola vez, como
// hace el sobre en `envelope.ts`. Cada contrato vive en `estadistica/`.
//
// Derivados del payload REAL (curl contra :8010), no de la documentación. Tres
// cosas que solo se ven mirando el dato: un mes sin lecturas llega con los cinco
// números en `null` y `n = 0`; las densidades de las crestas llegan SIN
// normalizar (KDE crudo, máximo ~0,05); y un grupo fuera de su ventana llega con
// `fuera_de_cobertura` explicando entre qué fechas sí habría dato.
export type { AnalyzedVariable } from "@/app/lib/analitica/contracts/estadistica/shared";
export {
  distributionResponseSchema,
  type DistributionResponse,
  type MonthlyBox,
} from "@/app/lib/analitica/contracts/estadistica/distribution";
export {
  irradiationResponseSchema,
  type IrradiationResponse,
  type MonthlyIrradiation,
} from "@/app/lib/analitica/contracts/estadistica/irradiation";
export { ridgesResponseSchema, type DensityGroup, type RidgesResponse } from "@/app/lib/analitica/contracts/estadistica/ridges";
export { correlationResponseSchema, type CorrelationResponse } from "@/app/lib/analitica/contracts/estadistica/correlation";
export { folderResponseSchema, type FolderResponse } from "@/app/lib/analitica/contracts/estadistica/folder";

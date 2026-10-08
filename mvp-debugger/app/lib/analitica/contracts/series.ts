// Barril de los dos contratos de la vista Series, derivados del payload REAL de
// `/analitica/completitud` y `/analitica/series` (inspeccionados el 2026-09-01),
// no de la documentación. Son las dos caras de una sola pregunta ("qué hay y
// cómo evoluciona"); cada esquema vive en `series/`.
//
// Lo que el backend YA manda y por eso acá no se calcula: los tramos sin dato
// vienen contados (`tramos_sin_datos`) y la serie trae un punto por CADA bucket
// del calendario, con `valor: null` donde no hubo ninguna lectura. Ese null es lo
// que corta la línea sobre el hueco de 126 días: si se perdiera al traducir, el
// gráfico volvería a unir enero con abril con una recta.
export type { CadenceOrigin } from "@/app/lib/analitica/contracts/series/cadenceOrigin";
export type { CompletenessBucket } from "@/app/lib/analitica/contracts/series/completenessBucket";
export type { DataGap } from "@/app/lib/analitica/contracts/series/dataGap";
export type { SourceSummary } from "@/app/lib/analitica/contracts/series/sourceSummary";
export {
  completenessSchema,
  type CompletenessPayload,
  type CompletenessSource,
} from "@/app/lib/analitica/contracts/series/completeness";
export type { SeriesPoint } from "@/app/lib/analitica/contracts/series/seriesPoint";
export type { VariableSeries } from "@/app/lib/analitica/contracts/series/variableSeries";
export { variableSeriesResponseSchema, type SeriesPayload } from "@/app/lib/analitica/contracts/series/variableSeriesResponse";

// El `contexto` que viaja con un hilo: qué período estaba mirando la persona al
// abrirlo, y qué día es en el sitio. Lo segundo hace falta para que «hace 15
// días» o «ayer» tengan un ancla que no sea el reloj del modelo.
import { formatRange, type DateRange } from "@/app/lib/analitica/dateRange";
import { GRANULARITY_LABEL } from "@/app/lib/analitica/granularity";
import { hoyEnSitio } from "@/app/lib/tiempo";

export function buildRangeContext(range: DateRange, today: string = hoyEnSitio()): string {
  return [
    "Asistente analítico",
    `rango elegido en la vista: ${formatRange(range)} (desde=${range.from}, hasta=${range.toExclusive} exclusivo)`,
    `granularidad ${GRANULARITY_LABEL[range.granularity]}`,
    `hoy en el sitio: ${today}`,
  ].join(" · ");
}

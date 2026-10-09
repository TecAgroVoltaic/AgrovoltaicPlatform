// Etiquetas de eje distintas de la categoría.
//
// La categoría es lo que lee el tooltip («mayo 2026»); el eje solo necesita lo
// corto («may»). Con la etiqueta larga en el eje, doce meses a 360 px se pisan
// y `hideOverlap` esconde la mitad.

/** Pinta `labels[i]` en el eje en lugar de la categoría `i`. Sin `labels`, el
 *  eje queda como estaba. */
export function withAxisLabels<TAxis extends { readonly axisLabel: object }>(
  axis: TAxis,
  labels: readonly string[] | undefined,
): TAxis {
  if (!labels) return axis;
  return {
    ...axis,
    axisLabel: {
      ...axis.axisLabel,
      formatter: (category: string, index: number) => labels[index] ?? category,
    },
  };
}

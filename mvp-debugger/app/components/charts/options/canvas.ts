// Cuánto mide el lienzo, y los presupuestos de texto que salen de ese ancho.
//
// Existe porque una opción de ECharts se escribe en PÍXELES, y una opción que no
// sabe cuánto mide su lienzo no puede ser responsiva. Los dos defectos que lo
// motivaron se midieron en el navegador, no se supusieron:
//
//   - a 286 px de lienzo (ventana de 360) el nombre de una cresta empieza en
//     x = −45 y se lee "raturá modulo inclinado" en vez del nombre del sensor;
//   - un ítem de leyenda de este sistema mide hasta 324 px ("Energía AC
//     acumulada de vida (contador, kWh)"), o sea más que el lienzo entero.
//
// Ninguna de las dos las arregla el CSS: pasan DENTRO del lienzo.
//
// Los anchos de referencia, medidos en la consola: 286 px con la ventana en 360,
// 316 en 390, 690 en 768, 348 en 1024 (van dos por fila) y 519 en 1440.

/** El lienzo tal como lo mide `EChart` sobre el contenedor real. */
export type ChartCanvas = {
  readonly width: number;
};

/** Lo que se lleva un ítem de leyenda sin contar su texto: la muestra de color,
 *  su separación, y el sitio que la leyenda paginada reserva para las flechas. */
const LEGEND_FURNITURE = 96;
/** Por debajo de esto un nombre recortado ya no distingue una serie de otra, así
 *  que se prefiere invadir un poco antes que dejar tres puntos suspensivos. */
const MIN_LEGEND_TEXT = 90;

/** Cuánto puede medir el texto de un ítem de leyenda antes de recortarse. */
export function legendTextWidth({ width }: ChartCanvas): number {
  return Math.max(MIN_LEGEND_TEXT, width - LEGEND_FURNITURE);
}

/** Parte del lienzo que puede quedarse el nombre de una fila del gráfico de
 *  crestas. La mitad no es un número al azar: el nombre más largo de la Fig. 7
 *  ("Temperatura modulo inclinado (cola 12,3 %)") mide unos 230 px medidos, así
 *  que con la mitad entra de una línea desde los 460 px de lienzo, y por debajo
 *  se parte, que es exactamente donde hace falta que se parta. */
const RIDGE_LABEL_SHARE = 0.5;
/** Con menos que esto el nombre sale en cinco líneas y no se lee ninguna. */
const MIN_RIDGE_LABEL = 80;

/** Ancho máximo del nombre de una cresta. Lo que no entre se parte en líneas:
 *  recortarlo se comería el final, y el final es la probabilidad de cola que el
 *  pie de la figura promete. */
export function ridgeLabelWidth({ width }: ChartCanvas): number {
  return Math.max(MIN_RIDGE_LABEL, Math.round(width * RIDGE_LABEL_SHARE));
}

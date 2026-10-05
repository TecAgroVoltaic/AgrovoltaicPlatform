// Cuánto espacio reserva un gráfico, y por qué ese espacio depende del ancho.
//
// El alto SALE del ancho, y lo resuelve el navegador: nadie mide nada en
// JavaScript, así que el sitio está reservado desde el primer pintado y la
// página no salta cuando el gráfico monta.
//
// Antes era un número fijo de 320 px a cualquier ancho, y eso deja las dos
// puntas mal. En un teléfono el lienzo mide 286 px (medido, ventana de 360): un
// rectángulo más alto que ancho estiraba la vista Estadística hasta 3.750 px, o
// sea cuatro pantallas de desplazamiento para cinco gráficos. En una ventana de
// 768 el lienzo mide 690 px: la misma altura dejaba una franja apaisada con la
// trama aplastada contra los ejes.
//
// La curva que sale, sobre los anchos medidos: 286 px -> 240 de alto (antes 320,
// o sea 80 px menos por gráfico y cinco gráficos por pantalla), 348 -> 240,
// 519 -> 311, 690 -> 340. Solo se mueve de verdad la punta angosta, que es
// donde estaba el problema. Los topes tampoco son de adorno: sin el mínimo un
// lienzo estrecho pediría 172 px y no entrarían ni los ejes; sin el máximo uno
// de 1.100 px pediría 660 y un solo gráfico llenaría la pantalla.
//
// ═══ POR QUÉ `cqw` Y NO `aspect-ratio` ═══════════════════════════════════════
// `aspect-ratio: 5/3` con `min-height: 240px` es la forma corta de escribir lo
// mismo, y ROMPE LA PÁGINA. La razón de aspecto es de doble sentido: del alto
// mínimo el navegador deduce un ancho mínimo (240 / 0,6 = 400 px), ese 400 se
// convierte en el ancho mínimo automático del ítem de rejilla, empuja la columna
// y la columna empuja la página. Medido: la vista Estadística en un teléfono de
// 360 px pasaba a medir 458 de ancho, con los cinco gráficos cortados por la
// derecha. `min-width: 0` en el lienzo NO alcanza, porque el que hereda el
// mínimo es la tarjeta que lo contiene.
//
// Con unidades de contenedor el cálculo va en un solo sentido: `60cqw` es el 60 %
// del ancho del envoltorio y solo alimenta el ALTO. El ancho jamás depende del
// alto, que es la regla que se quería.
import type { CSSProperties } from "react";

export const MIN_CHART_HEIGHT = 240;
export const MAX_CHART_HEIGHT = 340;
/** El alto como porcentaje del ancho del envoltorio (`cqw` = 1 % de ese ancho). */
const HEIGHT_SHARE_OF_WIDTH = 60;

/** El alto, escrito como lo entiende el navegador. Se arma con las constantes de
 *  arriba para que los tres números vivan en un solo sitio. */
const CHART_HEIGHT_RULE =
  `clamp(${MIN_CHART_HEIGHT}px, ${HEIGHT_SHARE_OF_WIDTH}cqw, ${MAX_CHART_HEIGHT}px)`;

/** El envoltorio que le da la medida al lienzo. Existe solo para eso: `60cqw` se
 * resuelve contra el contenedor ANCESTRO más cercano, así que el lienzo no puede
 * ser el suyo propio. */
export const CANVAS_CONTAINER_STYLE: CSSProperties = { containerType: "inline-size" };

/** Cómo se reserva el sitio del lienzo: alto fijo si el gráfico lo pide (su alto
 * lo manda su contenido y no su ancho), o el alto que sale del ancho. */
export function canvasStyle(height: number | undefined): CSSProperties {
  return { height: height ?? CHART_HEIGHT_RULE };
}

/** El hueco de los estados sin gráfico. Reserva un mínimo y nada más: con un
 * alto exacto, un motivo de dos líneas en un lienzo estrecho se saldría de la
 * caja, y el motivo es justamente lo que hay que leer. */
export function stateStyle(height: number | undefined): CSSProperties {
  return height === undefined ? { minHeight: MIN_CHART_HEIGHT } : { height };
}

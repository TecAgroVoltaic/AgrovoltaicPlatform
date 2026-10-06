// Cuánto correr el calendario de lado para que entre en su espacio.
//
// El calendario se abre bajo su botón, alineado a la izquierda. El de «Hasta»
// queda a la derecha del formulario y a 360 px se saldría por el borde; dentro
// del desplegable del chip de contexto, además, tiene que caber en ESE panel y
// no solo en la pantalla (medido: sin esto se pasaba 1 px del panel a 360 px).
// En vez de un caso por campo, se mide y se corre lo justo.

/** Margen mínimo entre el calendario y el borde de su espacio, en px. */
export const BOUNDARY_MARGIN_PX = 8;

export type HorizontalBox = { readonly left: number; readonly width: number };
export type HorizontalBoundary = { readonly left: number; readonly right: number };

/**
 * Desplazamiento horizontal (px, negativo = a la izquierda) que deja la caja
 * dentro de `[boundary.left + margin, boundary.right - margin]`. Si no entra
 * entera, se pega al margen izquierdo: el inicio del mes no puede quedar fuera.
 */
export function horizontalShift(
  box: HorizontalBox,
  boundary: HorizontalBoundary,
  margin = BOUNDARY_MARGIN_PX,
): number {
  const overflowRight = box.left + box.width - (boundary.right - margin);
  const shiftLeft = overflowRight > 0 ? -overflowRight : 0;
  const minLeft = boundary.left + margin;
  return box.left + shiftLeft < minLeft ? minLeft - box.left : shiftLeft;
}

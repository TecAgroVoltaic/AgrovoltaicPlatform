// Cuánto correr el calendario de lado para que entre en la pantalla.
//
// El calendario se abre bajo su botón, alineado a la izquierda. El de «Hasta»
// queda a la derecha del formulario y a 360 px se saldría por el borde: en vez
// de un caso por campo, se mide y se corre lo justo.

/** Margen mínimo entre el calendario y el borde de la pantalla, en px. */
export const VIEWPORT_MARGIN_PX = 8;

export type HorizontalBox = { readonly left: number; readonly width: number };

/**
 * Desplazamiento horizontal (px, negativo = a la izquierda) que deja la caja
 * dentro de `[margin, viewportWidth - margin]`. Si no entra entera, se pega al
 * margen izquierdo: el inicio del mes es lo que no puede quedar fuera.
 */
export function horizontalShift(box: HorizontalBox, viewportWidth: number, margin = VIEWPORT_MARGIN_PX): number {
  const overflowRight = box.left + box.width - (viewportWidth - margin);
  const shiftLeft = overflowRight > 0 ? -overflowRight : 0;
  const shiftedLeft = box.left + shiftLeft;
  return shiftedLeft < margin ? margin - box.left : shiftLeft;
}

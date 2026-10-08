// Tab da la vuelta dentro de un desplegable no modal: del último enfocable
// vuelve al primero, y con Shift del primero al último.
import type { KeyboardEvent } from "react";

const FOCUSABLE_SELECTOR = 'button:not([disabled]):not([tabindex="-1"]), select:not([disabled])';

/** Atrapa el foco de un Tab dentro de `container`; si no hay enfocables, no hace nada. */
export function trapFocusWithin(container: HTMLElement | null, event: KeyboardEvent<HTMLElement>): void {
  const focusables = Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

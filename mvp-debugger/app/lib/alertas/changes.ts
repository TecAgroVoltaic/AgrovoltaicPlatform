"use client";
// Aviso de «las alertas cambiaron» entre partes de la pantalla que no se
// conocen: la ficha (en la vista) y el contador (en el menú del cascarón).
//
// Observer sobre un evento del `window` y no un contexto de React: el cascarón
// es un Server Component y meterle un proveedor solo para esto lo volvería
// cliente entero. El evento no lleva datos a propósito: quien lo oye vuelve a
// pedir lo suyo, así nadie confía en una copia vieja.
const ALERTS_CHANGED_EVENT = "agrovoltaic:alertas-cambiaron";

export function announceAlertsChanged(): void {
  window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
}

/** Devuelve la baja, lista para el `return` de un efecto. */
export function onAlertsChanged(listener: () => void): () => void {
  window.addEventListener(ALERTS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(ALERTS_CHANGED_EVENT, listener);
}

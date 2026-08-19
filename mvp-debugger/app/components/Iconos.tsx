"use client";
// Iconos de la consola. SVG inline, trazo de 1.7, 16px — NO emojis: la paleta de
// la consola es sobria y un emoji rompe la tipografía y el color a la vez.
//
// Existen para distinguir de un vistazo QUIÉN hizo cada cosa: el algoritmo
// determinista, el modelo que orquesta, la web. Es la separación que este
// debugger tiene que demostrar, así que merece señal visual y no solo texto.

type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** Algoritmo / herramienta determinista: engranaje. */
export function IconoAlgoritmo({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** El modelo decidiendo: destellos. */
export function IconoModelo({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" />
    </svg>
  );
}

/** Redacción de la respuesta: bocadillo. */
export function IconoTexto({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0 1 8.2 4a8.4 8.4 0 0 1 12.8 7.5z" />
    </svg>
  );
}

/** Búsqueda externa: globo. */
export function IconoWeb({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </svg>
  );
}

/** Verificación cruzada correcta. */
export function IconoCheck({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Discrepancia / atención. */
export function IconoAlerta({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

/** Fallo de una herramienta. */
export function IconoError({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

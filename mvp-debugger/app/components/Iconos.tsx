"use client";
// Iconos de la consola. SVG inline, trazo de 1.7, 16px. NO emojis: la paleta de
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

// ── Navegación de la consola ───────────────────────────────────────────────
// Con la barra lateral compacta el icono ES la etiqueta, así que cada uno tiene
// que decir de qué vista habla sin leerse el texto. Se eligieron por el GESTO
// de cada vista, no por su tema: reconciliar es cuadrar dos lados, predecir es
// una curva contra su banda, la arquitectura es un grafo.

/** Reconciliación: dos lados que se cuadran. */
export function IconoReconciliar({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h11M4 7l3-3M4 7l3 3" />
      <path d="M20 17H9M20 17l-3-3M20 17l-3 3" />
    </svg>
  );
}

/** Predicción vs Real: una curva medida y su techo. */
export function IconoPrediccion({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 20V4M3 20h18" />
      <path d="M6 16c2.5 0 3.5-7 6-7s3.5 5 6 5" />
      <path d="M6 11c2.5 0 3.5-5 6-5s3.5 3 6 3" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

/** Arquitectura: un nodo con sus herramientas colgando. */
export function IconoGrafo({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="2.5" y="9.5" width="6" height="5" rx="1.4" />
      <rect x="15.5" y="3.5" width="6" height="5" rx="1.4" />
      <rect x="15.5" y="15.5" width="6" height="5" rx="1.4" />
      <path d="M8.5 12h3.5V6h3.5M12 12v6h3.5" />
    </svg>
  );
}

/** Rendimiento: un medidor. */
export function IconoRendimiento({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 17l4-5" />
      <circle cx="12" cy="17" r="1.2" />
    </svg>
  );
}

/** Costo y uso: una moneda con su cuenta. */
export function IconoCosto({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M14.6 9.4c-.5-.7-1.4-1.1-2.6-1.1-1.5 0-2.6.7-2.6 1.9 0 2.7 5.2 1.2 5.2 3.9 0 1.2-1.1 1.9-2.6 1.9-1.2 0-2.1-.4-2.6-1.1" />
    </svg>
  );
}

/** Salud del sistema: el pulso de la ingesta. */
export function IconoSalud({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2.5 12.5h4l2-5 3.5 9 2.5-6 1.5 2h5.5" />
    </svg>
  );
}

/** Documentación: un libro abierto. */
export function IconoDocs({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 6.5v13" />
      <path d="M12 6.5C10.6 5.2 8.8 4.5 6.5 4.5H3v13h3.5c2.3 0 4.1.7 5.5 2" />
      <path d="M12 6.5c1.4-1.3 3.2-2 5.5-2H21v13h-3.5c-2.3 0-4.1.7-5.5 2" />
    </svg>
  );
}

/** Desplegar / plegar la barra lateral. */
export function IconoPanel({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
    </svg>
  );
}

/** Minimizar el chat. Era una raya suelta como glifo: dependía de la fuente y se
    leía como puntuación. */
export function IconoMinimizar({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 12h12" />
    </svg>
  );
}

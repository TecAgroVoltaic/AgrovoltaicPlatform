"use client";
// Navegación de la consola. Con la barra lateral compacta el icono ES la
// etiqueta, así que cada uno tiene que decir de qué vista habla sin leerse el
// texto. Se eligieron por el GESTO de cada vista, no por su tema: reconciliar
// es cuadrar dos lados, predecir es una curva contra su banda, la arquitectura
// es un grafo.
import { iconSvgProps, type IconProps as P } from "./base";

/** Reconciliación: dos lados que se cuadran. */
export function IconoReconciliar({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M4 7h11M4 7l3-3M4 7l3 3" />
      <path d="M20 17H9M20 17l-3-3M20 17l-3 3" />
    </svg>
  );
}

/** Predicción vs Real: una curva medida y su techo. */
export function IconoPrediccion({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M3 20V4M3 20h18" />
      <path d="M6 16c2.5 0 3.5-7 6-7s3.5 5 6 5" />
      <path d="M6 11c2.5 0 3.5-5 6-5s3.5 3 6 3" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

/** Arquitectura: un nodo con sus herramientas colgando. */
export function IconoGrafo({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <rect x="2.5" y="9.5" width="6" height="5" rx="1.4" />
      <rect x="15.5" y="3.5" width="6" height="5" rx="1.4" />
      <rect x="15.5" y="15.5" width="6" height="5" rx="1.4" />
      <path d="M8.5 12h3.5V6h3.5M12 12v6h3.5" />
    </svg>
  );
}

/** Base de datos: un cilindro. */
export function IconoDatos({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
      <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </svg>
  );
}

/** Rendimiento: un medidor. */
export function IconoRendimiento({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 17l4-5" />
      <circle cx="12" cy="17" r="1.2" />
    </svg>
  );
}

/** Costo y uso: una moneda con su cuenta. */
export function IconoCosto({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M14.6 9.4c-.5-.7-1.4-1.1-2.6-1.1-1.5 0-2.6.7-2.6 1.9 0 2.7 5.2 1.2 5.2 3.9 0 1.2-1.1 1.9-2.6 1.9-1.2 0-2.1-.4-2.6-1.1" />
    </svg>
  );
}

/** Salud del sistema: el pulso de la ingesta. */
export function IconoSalud({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M2.5 12.5h4l2-5 3.5 9 2.5-6 1.5 2h5.5" />
    </svg>
  );
}

/** Documentación: un libro abierto. */
export function IconoDocs({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M12 6.5v13" />
      <path d="M12 6.5C10.6 5.2 8.8 4.5 6.5 4.5H3v13h3.5c2.3 0 4.1.7 5.5 2" />
      <path d="M12 6.5c1.4-1.3 3.2-2 5.5-2H21v13h-3.5c-2.3 0-4.1.7-5.5 2" />
    </svg>
  );
}

/** Calidad de datos: una cuadrícula con una celda marcada, como el mapa de días. */
export function IconoCalidad({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
         strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14.5 17.5l2 2 4-4.5" />
    </svg>
  );
}

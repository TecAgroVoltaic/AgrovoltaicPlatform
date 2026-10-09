"use client";
// Navegación de la sección de análisis (sistema de evaluación de datos).
import { iconSvgProps, type IconProps as P } from "./base";

/** Tablero: las casillas de indicadores. */
export function IconoTablero({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" />
    </svg>
  );
}

/** Series de tiempo: una curva sobre sus ejes. */
export function IconoSerie({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M3 4v16h18" />
      <path d="M6.5 15.5l4-5 3.5 3 4.5-6.5" />
    </svg>
  );
}

/** Estadística: la distribución de una variable. */
export function IconoEstadistica({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M3 20V4M3 20h18" />
      <rect x="6.5" y="13" width="3.5" height="4.5" rx="1" />
      <path d="M8.25 10v3M8.25 17.5v1.5" />
      <rect x="14" y="8" width="3.5" height="6.5" rx="1" />
      <path d="M15.75 5v3M15.75 14.5v2.5" />
    </svg>
  );
}

/** Descargas: una flecha que baja hacia la bandeja. */
export function IconoDescarga({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M12 3.5v11" />
      <path d="M7.5 10.5l4.5 4.5 4.5-4.5" />
      <path d="M4 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </svg>
  );
}

/** Asistente: un bocadillo de conversación con dos líneas de texto. */
export function IconoAsistente({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" />
      <path d="M9 10.5h6M9 14h4" />
    </svg>
  );
}

/** Fuentes de datos: un cilindro de base de datos. */
export function IconoFuentes({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" />
      <path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
    </svg>
  );
}

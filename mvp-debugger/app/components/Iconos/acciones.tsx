"use client";
// Acciones sobre la interfaz: plegar la barra lateral, minimizar el chat.
import { iconSvgProps, type IconProps as P } from "./base";

/** Desplegar / plegar la barra lateral. */
export function IconoPanel({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
    </svg>
  );
}

/** Minimizar el chat. Era una raya suelta como glifo: dependía de la fuente y se
    leía como puntuación. */
export function IconoMinimizar({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M6 12h12" />
    </svg>
  );
}

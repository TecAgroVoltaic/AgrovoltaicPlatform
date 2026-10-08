"use client";
// Resultado o aviso: verificación correcta, discrepancia, fallo y alertas.
import { iconSvgProps, type IconProps as P } from "./base";

/** Verificación cruzada correcta. */
export function IconoCheck({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Discrepancia / atención. */
export function IconoAlerta({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

/** Fallo de una herramienta. */
export function IconoError({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

/** Alertas: una campana. No el triángulo de `IconoAlerta`, que en la consola ya
 *  significa «discrepancia» y no «algo pide atención de una persona». */
export function IconoCampana({ size = 16, className }: P) {
  return (
    <svg {...iconSvgProps(size)} className={className}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

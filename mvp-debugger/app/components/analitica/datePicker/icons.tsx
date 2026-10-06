// Iconos de trazo del selector de fecha, con `currentColor` para seguir el tema.
// Propios y no los del Asistente: el selector es de la capa de análisis y no
// debe depender de una sección de la consola.
import type { ReactNode } from "react";

const ICON_SIZE = 14;
const ICON_STROKE = 2;

function StrokeIcon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconCalendar() {
  return (
    <StrokeIcon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </StrokeIcon>
  );
}

export function IconChevronLeft() {
  return (
    <StrokeIcon>
      <path d="M15 6l-6 6 6 6" />
    </StrokeIcon>
  );
}

export function IconChevronRight() {
  return (
    <StrokeIcon>
      <path d="M9 6l6 6-6 6" />
    </StrokeIcon>
  );
}

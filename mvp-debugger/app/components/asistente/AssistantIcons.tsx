// Los iconos del Asistente, copiados de los artboards del rediseño: SVG inline de
// trazo con `currentColor`, así toman el color del tema y del estado del botón.
// Viven acá y no en `Iconos.tsx` porque solo los usa esta sección.
import type { ReactNode } from "react";

type IconProps = { readonly size?: number; readonly strokeWidth?: number };

const DEFAULT_SIZE = 16;
const DEFAULT_STROKE = 1.8;

function Icon({ size = DEFAULT_SIZE, strokeWidth = DEFAULT_STROKE, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const icon = (paths: ReactNode) =>
  function AssistantIcon(props: IconProps) {
    return <Icon {...props}>{paths}</Icon>;
  };

export const IconSun = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </>,
);
export const IconThreads = icon(<path d="M4 6h16M4 12h16M4 18h10" />);
export const IconChat = icon(<path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" />);
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconCalendar = icon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
export const IconChevronDown = icon(<path d="M6 9l6 6 6-6" />);
export const IconChevronRight = icon(<path d="M9 6l6 6-6 6" />);
export const IconExpand = icon(<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />);
export const IconDownload = icon(<path d="M12 3v12M7 10l5 5 5-5M4 20h16" />);
export const IconTrend = icon(<path d="M3 17l5-6 4 3 5-7 4 4" />);
export const IconArrowUp = icon(<path d="M12 19V5M5 12l7-7 7 7" />);
export const IconClose = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const IconTrash = icon(<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />);
export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </>,
);
export const IconCheck = icon(<path d="M5 12l4 4 10-10" />);
export const IconDiagnose = icon(
  <>
    <path d="M9 12l2 2 4-4" />
    <circle cx="12" cy="12" r="9" />
  </>,
);
export const IconFailed = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </>,
);
export const IconSpinner = icon(<circle cx="12" cy="12" r="8" strokeDasharray="32 18" />);

/** El cuadrado de «Detener»: relleno, no trazo, como un botón de stop. */
export function IconStop({ size = DEFAULT_SIZE }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

"use client";
// El botón de una descarga: «Descargar» y, mientras baja, «Cancelar». Solo
// ícono en los renglones de archivo; con texto en las acciones de la tarjeta.
import type { ReactNode } from "react";

import { IconClose, IconDownload } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/blocks/blockCard.module.css";

const ICON_SIZE = 15;
const ICON_STROKE = 1.8;

export type DownloadActionProps = {
  /** Bajando: el botón pasa a «Cancelar». */
  readonly busy: boolean;
  /** El nombre accesible (y visible si no es solo ícono). */
  readonly label: string;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly iconOnly?: boolean;
  readonly icon?: ReactNode;
};

export function DownloadAction({ busy, label, onStart, onCancel, iconOnly = false, icon }: DownloadActionProps) {
  if (busy) {
    return (
      <button type="button" className={iconOnly ? styles.iconButton : styles.pill} aria-label={`Cancelar: ${label}`} onClick={onCancel}>
        <IconClose size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        {iconOnly ? null : <span>Cancelar</span>}
      </button>
    );
  }
  return (
    <button type="button" className={iconOnly ? styles.iconButton : styles.primary} aria-label={label} onClick={onStart}>
      {icon ?? <IconDownload size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
      {iconOnly ? null : <span>{label}</span>}
    </button>
  );
}

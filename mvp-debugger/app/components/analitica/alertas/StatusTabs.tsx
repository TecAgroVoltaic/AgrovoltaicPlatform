"use client";
// Las pestañas de estado: Abiertas · En seguimiento · Cerradas · Todas, cada una
// con su conteo del resumen. Son el mismo parámetro `estado` de la URL que antes
// escribía el selector.
//
// Patrón de pestañas de WAI-ARIA con activación manual: las flechas mueven el
// foco y Enter o Espacio eligen. Activar al mover escribiría una entrada de
// historial (y un pedido) por cada tecla.
import { useRef, type KeyboardEvent } from "react";

import { STATUS_FILTER_LABEL, STATUS_TABS } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/overview.module.css";
import type { AlertsSummary } from "@/app/lib/alertas/contracts";
import type { StatusFilter } from "@/app/lib/alertas/query";

/** Sumas de conteos que ya publica el resumen; nada se deduce de la lista. */
function tabCount(tab: StatusFilter, summary: AlertsSummary): number | null {
  const { byStatus } = summary;
  switch (tab) {
    case "open":
      return summary.openTotal;
    case "closed":
      return byStatus.resolved + byStatus.dismissed;
    case "all":
      return Object.values(byStatus).reduce((total, count) => total + count, 0);
    case "new":
    case "acknowledged":
    case "tracking":
    case "resolved":
    case "dismissed":
      return byStatus[tab];
  }
}

const NEXT_KEYS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

export type StatusTabsProps = {
  readonly current: StatusFilter;
  readonly summary: AlertsSummary | null;
  readonly panelId: string;
  readonly onSelect: (status: StatusFilter) => void;
};

export function StatusTabs({ current, summary, panelId, onSelect }: StatusTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  // Un corte que llegó por un enlace viejo (solo «nuevas») no es ninguna
  // pestaña: el foco de entrada cae en la primera.
  const focusable = STATUS_TABS.includes(current) ? current : STATUS_TABS[0];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    const step = NEXT_KEYS[event.key];
    const target =
      step !== undefined
        ? (index + step + buttons.length) % buttons.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : null;
    if (target === null) return;
    event.preventDefault();
    buttons[target]?.focus();
  };

  return (
    <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label="Estado de las alertas" onKeyDown={onKeyDown}>
      {STATUS_TABS.map((tab) => {
        const count = summary ? tabCount(tab, summary) : null;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === current}
            aria-controls={panelId}
            tabIndex={tab === focusable ? 0 : -1}
            onClick={() => onSelect(tab)}
          >
            {STATUS_FILTER_LABEL[tab]}
            {count !== null ? <span className={styles.tabCount}>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

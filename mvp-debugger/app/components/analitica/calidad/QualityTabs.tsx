"use client";
// Las preguntas que se hacen DESPUÉS del veredicto, una a la vez.
//
// Pestañas y no un acordeón: los cuerpos no son capas de detalle sobre lo
// mismo, son destinos alternativos de tareas distintas ("¿qué variable me
// frena?", "¿qué días sirven?", "¿qué está roto?"). Un acordeón invita a
// abrirlos todos y reconstruye la pared que había que romper; una pestaña deja
// UNA en pantalla y, sobre todo, deja las otras sin montar, que es lo que
// permite no pedir sus datos.
//
// Quién manda la pestaña activa vive fuera a propósito: la vista la necesita
// para decidir qué lectura dispara, y este componente no tiene por qué saber
// nada de peticiones.
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import styles from "@/app/components/analitica/calidad/calidad.module.css";

export type QualityTab = {
  readonly id: string;
  readonly label: string;
  /** Se construye siempre y solo se monta la activa: un elemento de React no
   * ejecuta su componente hasta que se pinta, así que las demás no piden nada. */
  readonly panel: ReactNode;
};

export type QualityTabsProps = {
  /** Nombre de la barra para el lector de pantalla. */
  readonly label: string;
  readonly tabs: readonly QualityTab[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
};

const STEP_BY_KEY: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };
const FIRST = 0;

export function QualityTabs({ label, tabs, activeId, onSelect }: QualityTabsProps) {
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  const active = tabs[activeIndex] ?? tabs[FIRST];

  const goTo = (index: number) => {
    const target = tabs[index];
    if (!target) return;
    onSelect(target.id);
    buttons.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP_BY_KEY[event.key];
    if (step !== undefined) {
      event.preventDefault();
      goTo((activeIndex + step + tabs.length) % tabs.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      goTo(FIRST);
    }
    if (event.key === "End") {
      event.preventDefault();
      goTo(tabs.length - 1);
    }
  };

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${prefix}-tab-${tab.id}`}
              className={selected ? `chip on ${styles.tab}` : `chip ${styles.tab}`}
              aria-selected={selected}
              aria-controls={`${prefix}-panel-${tab.id}`}
              // Roving tabindex: la barra entera es UNA parada de tabulador y
              // las flechas recorren las pestañas, como manda el patrón.
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${prefix}-panel-${active.id}`}
        aria-labelledby={`${prefix}-tab-${active.id}`}
        // Focalizable porque hay paneles sin un solo control dentro (el mapa de
        // días): sin esto, el teclado no puede llegar a leerlos.
        tabIndex={0}
        className={styles.panel}
      >
        {active.panel}
      </div>
    </>
  );
}

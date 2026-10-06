"use client";
// Búsqueda con espera: cada tecla actualiza el campo, pero la consulta sale
// recién cuando se deja de escribir. Sin la espera, «inversor» serían ocho
// pedidos al servicio y ocho entradas de historial.
import { useEffect, useId, useRef, useState } from "react";

import styles from "@/app/components/analitica/alertas/alertas.module.css";

export const SEARCH_DEBOUNCE_MS = 350;

export type SearchBoxProps = {
  /** Lo que dice la URL. */
  readonly value: string;
  readonly onCommit: (value: string) => void;
};

export function SearchBox({ value, onCommit }: SearchBoxProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    commitRef.current = onCommit;
  });

  // La URL manda cuando cambia por fuera (atrás, «Quitar filtros»). Se compara
  // sin espacios de los bordes porque la URL los recorta: sin eso, el espacio
  // entre dos palabras desaparecería mientras se escribe.
  useEffect(() => {
    setDraft((current) => (current.trim() === value.trim() ? current : value));
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const update = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commitRef.current(next), SEARCH_DEBOUNCE_MS);
  };

  return (
    <p className={`${styles.field} ${styles.searchField}`}>
      <label className="lbl" htmlFor={inputId}>
        Buscar
      </label>
      <input
        id={inputId}
        type="search"
        className="input input-sm"
        placeholder="título o variable"
        value={draft}
        onChange={(event) => update(event.target.value)}
      />
    </p>
  );
}

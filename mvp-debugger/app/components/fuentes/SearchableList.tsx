"use client";
// Una lista larga con búsqueda por nombre y paginación (las ~30 cajas de
// Cartago, las series del store ambiental). Con pocas filas no muestra ni el
// buscador ni el paginador: serían controles para nada.
import { useState, type ReactNode } from "react";

import styles from "@/app/components/fuentes/fuentes.module.css";

const DEFAULT_PAGE_SIZE = 8;

export type SearchableListProps<TItem> = {
  readonly items: readonly TItem[];
  /** El texto contra el que se busca y la clave de React de cada fila. */
  readonly keyOf: (item: TItem) => string;
  readonly renderItem: (item: TItem) => ReactNode;
  readonly searchLabel: string;
  readonly pageSize?: number;
};

export function SearchableList<TItem>({
  items,
  keyOf,
  renderItem,
  searchLabel,
  pageSize = DEFAULT_PAGE_SIZE,
}: SearchableListProps<TItem>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const needle = query.trim().toLowerCase();
  const matches = needle ? items.filter((item) => keyOf(item).toLowerCase().includes(needle)) : items;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = matches.slice(current * pageSize, (current + 1) * pageSize);
  const needsControls = items.length > pageSize;

  return (
    <div className={styles.list}>
      {needsControls ? (
        <input
          className="input sm"
          type="search"
          placeholder={searchLabel}
          aria-label={searchLabel}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      ) : null}
      <ul className={styles.rows}>
        {visible.map((item) => (
          <li key={keyOf(item)} className={styles.row}>
            {renderItem(item)}
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="muted small">Sin coincidencias.</p> : null}
      {pages > 1 ? (
        <div className={styles.pager}>
          <button className="btn ghost sm" type="button" aria-label="Página anterior"
                  disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button>
          <span className="muted small mono">{current + 1} / {pages}</span>
          <button className="btn ghost sm" type="button" aria-label="Página siguiente"
                  disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>›</button>
        </div>
      ) : null}
    </div>
  );
}

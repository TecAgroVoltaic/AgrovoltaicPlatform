"use client";
// Selector múltiple con búsqueda y paginación, para las listas largas de
// Descargas (cajas, tipos de sensor, columnas).
import { useState } from "react";

import type { PickerItem } from "./types";

const DEFAULT_PAGE_SIZE = 12;
const MAX_SELECTED_CHIPS = 8;

type SearchablePickerProps = {
  items: PickerItem[]; selected: Set<string>; onToggle: (k: string) => void; onClear?: () => void;
  pageSize?: number; placeholder: string; fixed?: Set<string>; emptyMeans: string;
};

export function SearchablePicker({
  items, selected, onToggle, onClear, pageSize = DEFAULT_PAGE_SIZE, placeholder, fixed, emptyMeans,
}: SearchablePickerProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const needle = query.trim().toLowerCase();
  const matches = needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = matches.slice(current * pageSize, (current + 1) * pageSize);
  const selectedKeys = [...selected];
  return (
    <div className="picker">
      <div className="picker-top">
        <input className="input sm" type="search" placeholder={placeholder} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} aria-label={placeholder} />
        <span className="muted small mono">{selected.size ? `${selected.size} de ${items.length}` : `${emptyMeans} (${items.length})`}</span>
        {onClear && <button className="btn ghost sm" disabled={!selected.size} onClick={onClear}>Limpiar</button>}
      </div>
      {selectedKeys.length > 0 && selectedKeys.length <= MAX_SELECTED_CHIPS && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {selectedKeys.map((k) => <button key={k} className="chip sm on" onClick={() => onToggle(k)} title="Quitar">{items.find((i) => i.k === k)?.label ?? k} ×</button>)}
        </div>
      )}
      <div className="picker-list">
        {visible.map((i) => {
          const isFixed = fixed?.has(i.k);
          const on = isFixed || selected.has(i.k);
          return (
            <button key={i.k} className={"pick" + (on ? " on" : "") + (isFixed ? " fixed" : "")} disabled={isFixed} onClick={() => onToggle(i.k)} title={i.meta}>
              <span className={"box" + (on ? " on" : "")} aria-hidden="true" />
              <span className="pick-l">{i.label}</span>
              {i.meta && <span className="pick-m mono">{i.meta}</span>}
            </button>
          );
        })}
        {!visible.length && <span className="muted small">sin coincidencias</span>}
      </div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn ghost sm" disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button>
          <span className="muted small mono">{current + 1} / {pages}</span>
          <button className="btn ghost sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

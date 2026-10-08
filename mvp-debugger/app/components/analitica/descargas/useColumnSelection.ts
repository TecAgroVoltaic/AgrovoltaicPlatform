"use client";
// Qué columnas se exportan. `null` = todas; la columna de tiempo va siempre y
// no se puede desmarcar. Marcar todas otra vez vuelve a `null`.
import { useMemo, useState } from "react";

import type { ExportColumn, ExportDataset } from "./types";

export type ColumnSelection = {
  readonly all: ExportColumn[];
  readonly timeColumn: string | null;
  readonly selected: ExportColumn[];
  readonly selectedNames: Set<string>;
  readonly customized: boolean;
  /** Lo que viaja en `columnas=`; vacío si van todas. */
  readonly param: string;
  readonly toggle: (name: string) => void;
  readonly clear: () => void;
};

export function useColumnSelection(dataset: ExportDataset | null): ColumnSelection {
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const all = dataset?.columnas ?? [];
  const timeColumn = dataset?.columna_tiempo ?? null;
  const selected = chosen ? all.filter((c) => chosen.has(c.nombre) || c.nombre === timeColumn) : all;
  const selectedNames = useMemo(() => new Set(selected.map((c) => c.nombre)), [selected]);

  function toggle(name: string) {
    if (name === timeColumn) return;
    const base = chosen ? new Set(chosen) : new Set(all.map((c) => c.nombre));
    if (base.has(name)) base.delete(name); else base.add(name);
    const withoutTime = all.filter((c) => c.nombre !== timeColumn).length;
    const marked = [...base].filter((n) => n !== timeColumn).length;
    setChosen(marked >= withoutTime ? null : base);
  }

  return {
    all,
    timeColumn,
    selected,
    selectedNames,
    customized: chosen !== null,
    param: chosen ? selected.map((c) => c.nombre).join(",") : "",
    toggle,
    clear: () => setChosen(null),
  };
}

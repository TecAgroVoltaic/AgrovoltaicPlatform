// Paso «Columnas»: qué variables entran al archivo. La de tiempo va fija.
import { useMemo } from "react";

import { AccordionStep } from "./AccordionStep";
import { compactColumnType } from "./helpers";
import { SearchablePicker } from "./SearchablePicker";
import type { PickerItem, StepFrame } from "./types";
import type { ColumnSelection } from "./useColumnSelection";

const COLUMNS_PAGE_SIZE = 10;

type ColumnPickerProps = StepFrame & { readonly columns: ColumnSelection };

export function ColumnPicker({ columns, ...frame }: ColumnPickerProps) {
  const { all, selected, selectedNames, customized, timeColumn, toggle, clear } = columns;
  const items: PickerItem[] = all.map((c) => ({ k: c.nombre, label: c.nombre, meta: compactColumnType(c.tipo) }));
  const fixed = useMemo(() => new Set(timeColumn ? [timeColumn] : []), [timeColumn]);
  const summary = customized ? `${selected.length} de ${all.length}` : <span className="muted">todas ({all.length})</span>;
  return (
    <AccordionStep {...frame} title="Columnas" summary={summary}>
      <SearchablePicker items={items} selected={selectedNames} onToggle={toggle} onClear={customized ? clear : undefined}
                        placeholder="Buscar variable…" emptyMeans="todas" fixed={fixed} pageSize={COLUMNS_PAGE_SIZE} />
    </AccordionStep>
  );
}

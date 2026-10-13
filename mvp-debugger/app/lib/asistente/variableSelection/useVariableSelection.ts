"use client";
// El estado del selector de variables: qué se eligió y en qué orden, la
// búsqueda y cómo se agrupan los archivos. Sin efectos: el envío lo hace quien
// usa el hook, por el mismo camino que un mensaje escrito.
import { useCallback, useMemo, useState } from "react";

import type { CatalogGroup, CatalogVariable } from "@/app/lib/asistente/contracts/selectorVariablesSpec";
import { filterGroups } from "@/app/lib/asistente/variableSelection/filterGroups";
import type { FileGrouping } from "@/app/lib/asistente/variableSelection/selectorMessage";

export type VariableSelection = {
  /** Las elegidas, en el orden en que se marcaron. */
  readonly chosen: readonly CatalogVariable[];
  /** Posición (desde 1) de una variable en la elección, o `null`. */
  readonly orderOf: (id: string) => number | null;
  readonly toggle: (id: string) => void;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly visibleGroups: readonly CatalogGroup[];
  readonly grouping: FileGrouping;
  readonly setGrouping: (grouping: FileGrouping) => void;
};

export function useVariableSelection(groups: readonly CatalogGroup[], preselected: readonly string[]): VariableSelection {
  const variablesById = useMemo(
    () => new Map(groups.flatMap((group) => group.variables.map((variable) => [variable.id, variable] as const))),
    [groups],
  );
  // La preselección del agente se respeta solo para ids que existen en los grupos.
  const [chosenIds, setChosenIds] = useState<readonly string[]>(() =>
    [...new Set(preselected)].filter((id) => variablesById.has(id)),
  );
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<FileGrouping>("together");

  const toggle = useCallback(
    (id: string) => setChosenIds((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id])),
    [],
  );
  const orderOf = useCallback(
    (id: string) => {
      const index = chosenIds.indexOf(id);
      return index < 0 ? null : index + 1;
    },
    [chosenIds],
  );
  const chosen = useMemo(
    () => chosenIds.flatMap((id) => variablesById.get(id) ?? []),
    [chosenIds, variablesById],
  );
  const visibleGroups = useMemo(() => filterGroups(groups, query), [groups, query]);

  return { chosen, orderOf, toggle, query, setQuery, visibleGroups, grouping, setGrouping };
}

"use client";
// El selector de variables que ofrece `catalogo_datos` (`_selector_variables`,
// contrato §4.2). Todo es local hasta «Armar archivo», que manda un mensaje de
// texto por el mismo camino que lo que escribe la persona.
import { useMemo } from "react";

import { IconSearch } from "@/app/components/asistente/AssistantIcons";
import { GroupingToggle } from "@/app/components/asistente/blocks/GroupingToggle";
import { InvalidBlock } from "@/app/components/asistente/blocks/InvalidBlock";
import { VariableGroupChips } from "@/app/components/asistente/blocks/VariableGroupChips";
import shared from "@/app/components/asistente/blocks/blockCard.module.css";
import styles from "@/app/components/asistente/blocks/selector.module.css";
import {
  parseSelectorVariablesSpec,
  type SelectorVariablesSpec,
} from "@/app/lib/asistente/contracts/selectorVariablesSpec";
import { selectorMessage } from "@/app/lib/asistente/variableSelection/selectorMessage";
import { useVariableSelection } from "@/app/lib/asistente/variableSelection/useVariableSelection";

const SEARCH_ICON_SIZE = 15;
const DEFAULT_TITLE = "Elegí las variables";

export type VariableSelectorCardProps = {
  readonly spec: unknown;
  readonly onAsk: (question: string) => void;
  readonly askDisabled: boolean;
};

export function VariableSelectorCard({ spec, ...actions }: VariableSelectorCardProps) {
  const parsed = useMemo(() => parseSelectorVariablesSpec(spec), [spec]);
  if (!parsed.ok) return <InvalidBlock what="El selector de variables" reason={parsed.reason} />;
  return <ValidVariableSelectorCard spec={parsed.spec} {...actions} />;
}

type ValidProps = Omit<VariableSelectorCardProps, "spec"> & { readonly spec: SelectorVariablesSpec };

function ValidVariableSelectorCard({ spec, onAsk, askDisabled }: ValidProps) {
  const selection = useVariableSelection(spec.grupos, spec.preseleccion);
  const title = spec.titulo || DEFAULT_TITLE;
  const count = selection.chosen.length;

  return (
    <section className={shared.card} aria-label={title}>
      <div className={shared.head}>
        <p className={shared.title}>{title}</p>
        <p className={shared.headMeta} aria-live="polite">
          {count === 1 ? "1 elegida" : `${count} elegidas`}
        </p>
      </div>
      <label className={styles.search}>
        <span className={shared.srOnly}>Buscar variable</span>
        <span className={styles.searchIcon} aria-hidden="true">
          <IconSearch size={SEARCH_ICON_SIZE} />
        </span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Buscar"
          value={selection.query}
          onChange={(event) => selection.setQuery(event.target.value)}
        />
      </label>
      <div className={styles.groups}>
        {selection.visibleGroups.length === 0 ? (
          <p className={styles.empty}>Nada coincide con «{selection.query}».</p>
        ) : (
          selection.visibleGroups.map((group) => (
            <VariableGroupChips
              key={`${group.fuente}:${group.grupo}`}
              group={group}
              orderOf={selection.orderOf}
              onToggle={selection.toggle}
            />
          ))
        )}
      </div>
      <div className={styles.footer}>
        <GroupingToggle value={selection.grouping} onChange={selection.setGrouping} />
        <button
          type="button"
          className={shared.primary}
          disabled={count === 0 || askDisabled}
          title={askDisabled ? "Esperá a que termine la respuesta en curso" : undefined}
          onClick={() => onAsk(selectorMessage(selection.chosen, selection.grouping))}
        >
          Armar archivo
        </button>
      </div>
    </section>
  );
}

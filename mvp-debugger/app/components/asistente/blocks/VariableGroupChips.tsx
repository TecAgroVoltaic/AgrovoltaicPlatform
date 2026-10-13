"use client";
// Un grupo del catálogo (fuente + grupo) con sus variables como chips. Un chip
// elegido muestra su número de orden: el orden es el de las columnas.
import styles from "@/app/components/asistente/blocks/selector.module.css";
import { SourceDot } from "@/app/components/fuentes/SourceDot";
import type { CatalogGroup, CatalogVariable } from "@/app/lib/asistente/contracts/selectorVariablesSpec";
import { sourceInfo } from "@/app/lib/fuentes/registry";

export type VariableGroupChipsProps = {
  readonly group: CatalogGroup;
  readonly orderOf: (id: string) => number | null;
  readonly onToggle: (id: string) => void;
};

export function VariableGroupChips({ group, orderOf, onToggle }: VariableGroupChipsProps) {
  const source = sourceInfo(group.fuente);
  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupHead}>
        <SourceDot source={group.fuente} />
        <span className={styles.groupName} title={`${group.etiqueta} · ${source.label}`}>
          {group.etiqueta} · {source.label}
        </span>
      </legend>
      <div className={styles.chips}>
        {group.variables.map((variable) => (
          <VariableChip key={variable.id} variable={variable} order={orderOf(variable.id)} onToggle={onToggle} />
        ))}
      </div>
    </fieldset>
  );
}

type VariableChipProps = {
  readonly variable: CatalogVariable;
  readonly order: number | null;
  readonly onToggle: (id: string) => void;
};

function VariableChip({ variable, order, onToggle }: VariableChipProps) {
  const coverage = variable.desde && variable.hasta ? `${variable.desde} a ${variable.hasta}` : null;
  const details = [variable.unidad, coverage, variable.nota].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={order !== null}
      aria-label={order === null ? variable.etiqueta : `${variable.etiqueta}, elegida en el puesto ${order}`}
      title={details || undefined}
      onClick={() => onToggle(variable.id)}
    >
      {order === null ? null : (
        <span className={styles.order} aria-hidden="true">
          {order}
        </span>
      )}
      <span className={styles.chipLabel}>{variable.etiqueta}</span>
      {variable.unidad ? <span className={styles.chipUnit}>{variable.unidad}</span> : null}
    </button>
  );
}

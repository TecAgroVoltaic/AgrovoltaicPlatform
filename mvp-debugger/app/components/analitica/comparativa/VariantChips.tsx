"use client";
// El selector de variante del PR.
//
// Cada chip dice sobre cuántos días se agregó SU variante y si el insumo es una
// transposición modelada que todavía espera aval: elegir un método sin ver su
// muestra es como leer el número sin saber de dónde sale.
import { formatDays } from "@/app/components/analitica/comparativa/format";
import type { Variant, VariantId } from "@/app/components/analitica/comparativa/variants";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

export type VariantChipsProps = {
  readonly options: readonly Variant[];
  readonly selected: Variant | null;
  readonly onSelect: (id: VariantId) => void;
};

export function VariantChips({ options, selected, onSelect }: VariantChipsProps) {
  return (
    // `variantes` solo crece el objetivo tocable en pantallas de dedo: los
    // chips del cascarón miden 27 px de alto y con el pulgar se falla.
    <div
      className={`chips ${styles.variantes}`}
      role="group"
      aria-label="Variante del Performance Ratio"
    >
      {options.map((variant) => (
        <button
          key={variant.id}
          type="button"
          className={variant.id === selected?.id ? "chip on" : "chip"}
          aria-pressed={variant.id === selected?.id}
          onClick={() => onSelect(variant.id)}
        >
          {variant.label}
          <span className="chip-sub">
            {formatDays(variant.days)}
            {variant.provisional ? " · provisional" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

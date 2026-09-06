"use client";
// Fig. 7: la misma magnitud, un sensor por cresta.
//
// EL PDF LA LLAMA "regresión Ridge" y enlaza la regularización de Tikhonov, pero
// lo que la figura muestra es un gráfico de CRESTAS (ridgeline) de densidades por
// sensor, y el código de referencia se llama `temp_tail_ridge_plot.py`. Se
// implementa lo que muestra la figura; la discrepancia está registrada para
// consultarla con el equipo. No conviertas esto en una regresión.
import { RidgelineChart, type DensityCurve, type RidgelineData } from "@/app/components/charts";
import { isMeasured } from "@/app/lib/analitica/contracts/metric";
import type { DensityGroup, RidgesResponse } from "@/app/lib/analitica/contracts/estadistica";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/estadistica/chartState";
import type { FigureProps } from "@/app/components/analitica/estadistica/figures/props";
import styles from "@/app/components/analitica/estadistica/vista.module.css";

const CAPTION =
  "Cada cresta es la densidad de un sensor, escalada al máximo común: comparan forma, no cantidad. " +
  "Entre paréntesis, la probabilidad de pasar del umbral.";

function drawable(group: DensityGroup): boolean {
  return group.density !== null && group.density.length > 0;
}

/**
 * Las curvas, escaladas al pico común.
 *
 * El backend manda la densidad KDE cruda (máximo ~0,05) y la primitiva espera
 * alturas en [0, 1]. Escalar por el máximo COMÚN y no por el de cada curva es lo
 * que mantiene comparables las crestas: normalizada una por una, un sensor con
 * media docena de lecturas se vería tan alto como el que tiene veinte mil.
 * Es escala de dibujo, no un número que se reporte.
 */
export function toRidgelineData(response: RidgesResponse): RidgelineData {
  const { grid, groups, unit, threshold } = response.payload;
  const drawableGroups = groups.filter(drawable);
  const peak = Math.max(...drawableGroups.flatMap((group) => group.density ?? []), 0);
  return {
    unit,
    ...(threshold === null
      ? {}
      : { threshold: { value: threshold, label: `umbral ${threshold} ${unit}` } }),
    curves: drawableGroups.map((group) => toCurve(group, grid, peak)),
  };
}

function toCurve(group: DensityGroup, grid: readonly number[], peak: number): DensityCurve {
  return {
    id: group.key,
    label: group.label,
    x: grid,
    density: (group.density ?? []).map((value) => (peak > 0 ? value / peak : 0)),
    tailProbability: isMeasured(group.tailProbability) ? group.tailProbability.value : null,
  };
}

/** Qué sensores quedaron fuera del dibujo y por qué. Callarlos haría creer que
 * la comparación es entre todos, cuando le falta uno. */
export function excludedGroups(response: RidgesResponse): readonly string[] {
  return response.payload.groups
    .filter((group) => !drawable(group))
    .map((group) => `${group.label}: ${group.outOfCoverage ?? "sin lecturas suficientes en el rango"}.`);
}

function emptiness(response: RidgesResponse) {
  if (response.payload.groups.some(drawable)) return null;
  const excluded = excludedGroups(response);
  const code = response.payload.groups.some((group) => group.outOfCoverage)
    ? "OUT_OF_COVERAGE"
    : "NO_ROWS";
  return emptyBecause(code, excluded.join(" ") || "Ningún sensor devolvió lecturas.");
}

export function RidgesFigure({ result, outOfCoverage, onRetry }: FigureProps<RidgesResponse>) {
  const state = chartStateFrom(result, {
    outOfCoverage,
    onRetry,
    adapt: toRidgelineData,
    emptiness,
  });
  const excluded = result?.ok ? excludedGroups(result.data) : [];

  return (
    <div className={styles.figura}>
      <RidgelineChart
        title="Distribución por sensor"
        subtitle="Densidad de cada sensor de temperatura en el rango, con su probabilidad de cola (Fig. 7)."
        caption={CAPTION}
        state={state}
      />
      {state.status === "ready" && excluded.length > 0 ? (
        <p className={`${styles.nota} muted small`}>Fuera de la comparación · {excluded.join(" ")}</p>
      ) : null}
    </div>
  );
}

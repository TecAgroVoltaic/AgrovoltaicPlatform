"use client";
// «Qué contiene» una fuente: sus tablas, sus series o sus cajas, cada una con su
// cobertura. Las cifras (filas, lecturas) llegan del backend; acá solo se
// escriben.
import { SearchableList } from "@/app/components/fuentes/SearchableList";
import type { SourceBox, SourceEntry, SourceSeries, SourceTable } from "@/app/lib/fuentes/contracts";
import { fechaCorta } from "@/app/lib/tiempo";
import styles from "@/app/components/fuentes/fuentes.module.css";

const LOCALE = "es-CR";
const UNKNOWN_DATE = "?";
const WITH_YEAR = true;
/** Columnas de trazabilidad del ETL: existen, pero no son lo que se busca. */
const TECHNICAL_COLUMNS: ReadonlySet<string> = new Set(["n_muestras", "intervalo_original_seg", "fuente_archivo"]);

function variablesInReadingOrder(variables: readonly string[]): string[] {
  const measured = variables.filter((name) => !TECHNICAL_COLUMNS.has(name));
  return [...measured, ...variables.filter((name) => TECHNICAL_COLUMNS.has(name))];
}

function coverage(from: string | null, to: string | null): string {
  if (!from && !to) return "sin fechas";
  const start = from ? fechaCorta(from, WITH_YEAR) : UNKNOWN_DATE;
  const end = to ? fechaCorta(to, WITH_YEAR) : UNKNOWN_DATE;
  return `${start} → ${end}`;
}

function count(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString(LOCALE)} ${value === 1 ? singular : plural}`;
}

function TableRow({ table }: { readonly table: SourceTable }) {
  return (
    <>
      <span className={styles.rowName} title={table.relation}>{table.key}</span>
      <span className={styles.rowMeta}>
        {coverage(table.from, table.to)}
        {table.rows === null ? "" : ` · ${count(table.rows, "fila", "filas")}`}
      </span>
      {table.variables.length > 0 ? (
        <details className={styles.variables}>
          <summary>{count(table.variables.length, "variable", "variables")}</summary>
          <p>{variablesInReadingOrder(table.variables).join(", ")}</p>
        </details>
      ) : null}
    </>
  );
}

function SeriesRow({ series }: { readonly series: SourceSeries }) {
  const unit = series.unit ? ` (${series.unit})` : "";
  return (
    <>
      <span className={styles.rowName}>{`${series.box} · ${series.variable}${unit}`}</span>
      <span className={styles.rowMeta}>
        {coverage(series.from, series.to)} · {count(series.count, "lectura", "lecturas")}
      </span>
    </>
  );
}

function BoxRow({ box }: { readonly box: SourceBox }) {
  return (
    <>
      <span className={styles.rowName}>{box.name}</span>
      <span className={styles.rowMeta} title={box.sensors.join(", ")}>
        {count(box.sensors.length, "sensor", "sensores")}
      </span>
    </>
  );
}

const seriesKey = (series: SourceSeries) => `${series.box} · ${series.variable}`;

export function SourceContents({ entry }: { readonly entry: SourceEntry }) {
  const isEmpty = entry.tables.length + entry.series.length + entry.boxes.length === 0;
  if (isEmpty) return <p className="muted small">La fuente no informó su contenido.</p>;
  return (
    <>
      {entry.tables.length > 0 ? (
        <SearchableList items={entry.tables} keyOf={(table) => table.key} searchLabel="Buscar tabla"
                        renderItem={(table) => <TableRow table={table} />} />
      ) : null}
      {entry.series.length > 0 ? (
        <SearchableList items={entry.series} keyOf={seriesKey} searchLabel="Buscar caja o variable"
                        renderItem={(series) => <SeriesRow series={series} />} />
      ) : null}
      {entry.boxes.length > 0 ? (
        <SearchableList items={entry.boxes} keyOf={(box) => box.name} searchLabel="Buscar caja"
                        renderItem={(box) => <BoxRow box={box} />} />
      ) : null}
    </>
  );
}

"use client";
// Una fuente de datos: su etiqueta, región, vía de acceso y qué vistas alimenta.
// El contenido (tablas, series o cajas) va plegado detrás de «Qué contiene».
import Link from "next/link";

import { SourceBadge } from "@/app/components/fuentes/SourceBadge";
import { SourceContents } from "@/app/components/fuentes/SourceContents";
import type { SourceEntry } from "@/app/lib/fuentes/contracts";
import styles from "@/app/components/fuentes/fuentes.module.css";

const DOWNLOADS_PATH = "/descargas";
const AGRODASH_UNAVAILABLE = "agrodash_no_disponible";
const REASON_TEXT: Readonly<Record<string, string>> = {
  [AGRODASH_UNAVAILABLE]: "AgroDash no respondió: el contenido de esta fuente no se pudo leer ahora.",
};

export type SourceCardProps = {
  readonly entry: SourceEntry;
  readonly open: boolean;
  readonly onToggle: () => void;
};

export function SourceCard({ entry, open, onToggle }: SourceCardProps) {
  const headingId = `fuente-${entry.id}`;
  const contentsId = `${headingId}-contenido`;
  return (
    <article className={`card ${styles.card}`} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.name}>{entry.name}</h2>
        <SourceBadge source={entry.id} />
      </div>
      <p className={styles.meta}>{entry.region} · {entry.access}</p>
      {entry.description ? <p className={styles.description}>{entry.description}</p> : null}
      {entry.reason ? <p className={styles.warning}>{REASON_TEXT[entry.reason] ?? entry.reason}</p> : null}

      {entry.feeds.length > 0 ? (
        <div className={styles.feeds}>
          <span className={styles.feedsLabel}>Alimenta a</span>
          {entry.feeds.map((view) => (
            <span key={view} className={styles.feed}>{view}</span>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className="btn ghost sm" aria-expanded={open} aria-controls={contentsId}
                onClick={onToggle}>
          {open ? "Ocultar contenido" : "Qué contiene"}
        </button>
        <Link className={styles.download} href={DOWNLOADS_PATH}>Ir a Descargas</Link>
      </div>
      {open ? (
        <div id={contentsId} className={styles.contents}>
          <SourceContents entry={entry} />
        </div>
      ) : null}
    </article>
  );
}

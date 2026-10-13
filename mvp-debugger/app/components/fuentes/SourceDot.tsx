// La fuente reducida a su punto de color, para listas donde la píldora entera
// (`SourceBadge`) no cabe. El nombre queda en el tooltip y para lectores de pantalla.
import styles from "@/app/components/fuentes/sourceDot.module.css";
import { sourceInfo, type SourceId } from "@/app/lib/fuentes/registry";

export function SourceDot({ source }: { readonly source: SourceId }) {
  const info = sourceInfo(source);
  return <span className={styles.dot} data-tone={info.tone} title={info.label} role="img" aria-label={`Fuente: ${info.label}`} />;
}

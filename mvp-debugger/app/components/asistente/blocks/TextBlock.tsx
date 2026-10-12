// Lo que dijo el modelo, en markdown.
import styles from "@/app/components/asistente/asistente.module.css";
import { renderMd } from "@/app/lib/markdown";

export function TextBlock({ markdown }: { readonly markdown: string }) {
  // `renderMd` escapa todo el HTML del modelo antes de dar formato.
  return <div className={`md ${styles.text}`} dangerouslySetInnerHTML={{ __html: renderMd(markdown) }} />;
}

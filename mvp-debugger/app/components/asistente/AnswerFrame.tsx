// El marco de una respuesta del asistente: la marca del sol a la izquierda y el
// contenido en texto corrido, sin burbuja. Lo comparten la respuesta guardada y
// la que está llegando, para que una no salte de lugar al convertirse en la otra.
import type { ReactNode } from "react";

import { IconSun } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/asistente.module.css";

const MARK_ICON_SIZE = 14;
const MARK_ICON_STROKE = 2.2;

export type AnswerFrameProps = {
  readonly label: string;
  readonly busy?: boolean;
  readonly children: ReactNode;
};

export function AnswerFrame({ label, busy = false, children }: AnswerFrameProps) {
  return (
    <article className={styles.answer} aria-label={label} aria-busy={busy || undefined}>
      <div className={styles.mark} aria-hidden="true">
        <IconSun size={MARK_ICON_SIZE} strokeWidth={MARK_ICON_STROKE} />
      </div>
      <div className={styles.answerBody}>{children}</div>
    </article>
  );
}

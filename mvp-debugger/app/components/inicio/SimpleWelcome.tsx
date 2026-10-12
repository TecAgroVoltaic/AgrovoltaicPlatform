"use client";
// La pantalla vacía del modo simple: «¿Qué necesitás?», el campo y cuatro
// sugerencias. En la computadora el campo va al centro; en el teléfono baja al
// pie, que es donde lo alcanza el pulgar y donde queda sobre el teclado. El orden
// del DOM es el de la computadora (título, campo, sugerencias) porque es el del
// teclado; el teléfono solo reacomoda con CSS.
import { Composer } from "@/app/components/asistente/Composer";
import type { EmptyStateProps } from "@/app/components/asistente/EmptyState";
import { SourceLegend } from "@/app/components/inicio/SourceLegend";
import { SuggestionPills } from "@/app/components/inicio/SuggestionPills";
import styles from "@/app/components/inicio/welcome.module.css";

// Sin conversación no hay respuesta en curso que detener.
const NOTHING_TO_CANCEL = () => undefined;

export function SimpleWelcome({ onAsk, disabled }: EmptyStateProps) {
  return (
    <div className={styles.welcome}>
      <h2 className={styles.heading}>¿Qué necesitás?</h2>
      <div className={styles.field}>
        <Composer busy={disabled} onSend={onAsk} onCancel={NOTHING_TO_CANCEL} showIntents={false} />
      </div>
      <SuggestionPills onAsk={onAsk} disabled={disabled} />
      <SourceLegend />
    </div>
  );
}

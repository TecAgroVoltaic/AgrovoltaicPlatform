"use client";
// El modo simple con el chat apagado. El modo simple ES el chat, así que sin él
// la pantalla no puede quedar vacía: dice por qué y ofrece pasar al modo
// avanzado, donde las vistas siguen funcionando sin el agente.
import { SimpleTopBar } from "@/app/components/inicio/SimpleTopBar";
import styles from "@/app/components/inicio/unavailable.module.css";
import { useModeSwitch } from "@/app/lib/modo/useModeSwitch";

export type SimpleUnavailableProps = {
  /** El aviso del servidor, que sabe qué interruptor lo apagó. */
  readonly reason: string;
};

export function SimpleUnavailable({ reason }: SimpleUnavailableProps) {
  const switchMode = useModeSwitch();
  return (
    <div className={styles.page}>
      <SimpleTopBar />
      <main className={styles.body}>
        <h2 className={styles.heading}>El asistente no está disponible</h2>
        <p className={styles.reason} role="status">
          {reason}
        </p>
        <button type="button" className={styles.primary} onClick={() => switchMode("avanzado")}>
          Ir al modo avanzado
        </button>
      </main>
    </div>
  );
}

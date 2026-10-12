"use client";
// El chat del modo simple: el MISMO `AssistantView` del modo avanzado, con su
// cabecera y su pantalla vacía cambiadas por las del modo simple. Los hilos, el
// stream y las respuestas son los de siempre: no hay un segundo chat que mantener.
import { AssistantView } from "@/app/components/asistente/AssistantView";
import { SimpleHeader } from "@/app/components/inicio/SimpleHeader";
import { SimpleWelcome } from "@/app/components/inicio/SimpleWelcome";
import styles from "@/app/components/inicio/simpleChat.module.css";

export function SimpleChat() {
  return (
    <div className={styles.simple}>
      <AssistantView
        renderHeader={(props) => <SimpleHeader {...props} />}
        renderEmpty={(props) => <SimpleWelcome {...props} />}
      />
    </div>
  );
}

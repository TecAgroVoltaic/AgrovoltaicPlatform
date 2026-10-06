"use client";
// Lo que se ve antes de la primera pregunta: qué hace el asistente y ejemplos
// que se pueden pulsar. Los ejemplos cubren las tres cosas que sabe hacer:
// contestar, graficar y exportar.
import styles from "@/app/components/asistente/asistente.module.css";

export const EXAMPLE_QUESTIONS: readonly string[] = [
  "¿Cómo estuvo la irradiancia hace 15 días?",
  "Graficá la potencia de agosto",
  "Dame la temperatura del 12 de agosto en csv",
  "¿Qué arreglo rindió mejor en el rango elegido?",
];

export function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className={styles.empty}>
      <p className="muted small">
        Preguntá sobre los datos de la planta en lenguaje natural. Cada cifra sale de los mismos
        algoritmos que usan las vistas; el asistente puede graficar y preparar descargas en csv,
        dat o mat. El rango elegido arriba viaja como contexto de la conversación.
      </p>
      <div className={styles.examples}>
        {EXAMPLE_QUESTIONS.map((question) => (
          <button key={question} type="button" className="chip" onClick={() => onAsk(question)}>
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

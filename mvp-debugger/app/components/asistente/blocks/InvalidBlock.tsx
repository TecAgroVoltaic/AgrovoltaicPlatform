// Lo que se ve cuando un spec del asistente no cumple su contrato: qué bloque
// era y el primer motivo. Mejor eso que una tarjeta a medias.
import styles from "@/app/components/asistente/blocks/blockCard.module.css";

export function InvalidBlock({ what, reason }: { readonly what: string; readonly reason: string }) {
  return (
    <div className={styles.card} role="alert">
      <p className={styles.title}>{what} no es válido</p>
      <p className={styles.meta} title={reason}>
        {reason}
      </p>
    </div>
  );
}

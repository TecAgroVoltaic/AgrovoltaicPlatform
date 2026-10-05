"use client";
// El aval que falta (R2).
//
// La irradiancia en el plano de cada arreglo no se midió: se modeló con una
// transposición. Leo Cardinale confirmó el PRINCIPIO (una irradiancia por plano)
// pero dejó abierta CUÁL ecuación usar, y eso lo tiene que confirmar Hugo.
// Mientras tanto las dos variantes POA son el mejor insumo disponible, no un
// resultado firme, y quien lea la pantalla tiene derecho a saberlo sin abrir el
// JSON.
import type { PendingApproval } from "@/app/lib/analitica/contracts/comparativa";
import { INPUT_LABEL } from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const SEPARATOR = " y ";

export function PendingApprovalNotice({ approval }: { readonly approval: PendingApproval }) {
  if (approval.provisionalInputs.length === 0) return null;
  const inputs = approval.provisionalInputs.map((input) => INPUT_LABEL[input]).join(SEPARATOR);

  return (
    <div className={styles.noticeWarning}>
      <p className={styles.noticeTitle}>
        Las variantes contra {inputs} son provisionales: esperan el aval de {approval.approver} (
        {approval.reference})
      </p>
      <p className="muted small">{approval.detail}</p>
    </div>
  );
}

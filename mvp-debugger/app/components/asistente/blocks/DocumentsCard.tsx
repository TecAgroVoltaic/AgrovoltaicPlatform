"use client";
// De qué documentos del proyecto salió la respuesta (`_documentos`, contrato
// §4.4). Son chips de referencia, no enlaces: la documentación no se sirve en
// la consola. La ruta queda en el tooltip para quien la quiera abrir en el repo.
import { useMemo } from "react";

import { InvalidBlock } from "@/app/components/asistente/blocks/InvalidBlock";
import styles from "@/app/components/asistente/blocks/references.module.css";
import { IconoDocs } from "@/app/components/Iconos";
import { parseDocumentosSpec } from "@/app/lib/asistente/contracts/documentosSpec";

const ICON_SIZE = 14;

export function DocumentsCard({ spec }: { readonly spec: unknown }) {
  const parsed = useMemo(() => parseDocumentosSpec(spec), [spec]);
  if (!parsed.ok) return <InvalidBlock what="La lista de documentos" reason={parsed.reason} />;
  if (parsed.spec.documentos.length === 0) return null;

  return (
    <ul className={styles.documents} aria-label="Documentos consultados">
      <li className={styles.documentsLabel} aria-hidden="true">
        <IconoDocs size={ICON_SIZE} />
        Documentos
      </li>
      {parsed.spec.documentos.map((document) => (
        <li key={`${document.ruta}#${document.seccion ?? ""}`} className={styles.document} title={document.ruta}>
          <span className={styles.documentTitle}>{document.titulo}</span>
          {document.seccion ? <span className={styles.documentSection}>· {document.seccion}</span> : null}
        </li>
      ))}
    </ul>
  );
}

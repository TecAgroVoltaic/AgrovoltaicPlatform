"use client";
// La sección de la consola que propone el asistente (`_navegacion`, contrato
// §4.3): una tarjeta con «Ir». El enlace sale de la lista blanca del catálogo;
// si la sección no existe, la tarjeta no se dibuja.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { IconArrowRight } from "@/app/components/asistente/AssistantIcons";
import { InvalidBlock } from "@/app/components/asistente/blocks/InvalidBlock";
import shared from "@/app/components/asistente/blocks/blockCard.module.css";
import styles from "@/app/components/asistente/blocks/references.module.css";
import { parseNavegacionSpec } from "@/app/lib/asistente/contracts/navegacionSpec";
import { sectionHref } from "@/app/lib/navegacion/sectionHref";

const ICON_SIZE = 15;

export function NavigationCard({ spec }: { readonly spec: unknown }) {
  const currentQuery = useSearchParams();
  const parsed = useMemo(() => parseNavegacionSpec(spec), [spec]);
  const href = useMemo(
    () => (parsed.ok ? sectionHref({ sectionId: parsed.spec.seccion, params: parsed.spec.params }, currentQuery ?? undefined) : null),
    [parsed, currentQuery],
  );
  if (!parsed.ok) return <InvalidBlock what="El enlace a la sección" reason={parsed.reason} />;
  if (!href) return null;

  const { etiqueta, detalle } = parsed.spec;
  return (
    <section className={`${shared.card} ${styles.navigation}`} aria-label={`Sección: ${etiqueta}`}>
      <div className={styles.navigationText}>
        <p className={shared.title} title={etiqueta}>
          {etiqueta}
        </p>
        {detalle ? (
          <p className={shared.meta} title={detalle}>
            {detalle}
          </p>
        ) : null}
      </div>
      <Link href={href} className={shared.primary} aria-label={`Ir a ${etiqueta}`}>
        <span>Ir</span>
        <IconArrowRight size={ICON_SIZE} />
      </Link>
    </section>
  );
}

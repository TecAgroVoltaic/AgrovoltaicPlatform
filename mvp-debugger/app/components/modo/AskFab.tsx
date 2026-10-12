"use client";
// El botón flotante «Preguntar» del modo avanzado: abre el Asistente con el rango
// que se está mirando. En el Asistente no aparece, porque ya se está ahí.
//
// Además del botón deja una reserva al pie de la columna: un botón fijo tapa lo
// último de la página si nada le hace lugar. En las vistas con pie del cascarón
// la reserva sobra (el pie ya deja ese aire) y la hoja la apaga.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { IconoAsistente } from "@/app/components/Iconos";
import styles from "@/app/components/modo/askFab.module.css";
import { askHref } from "@/app/lib/navegacion/askHref";
import { ASISTENTE_PATH } from "@/app/lib/navegacion/paths";

const ICON_SIZE = 18;
const LABEL = "Preguntar";

export function AskFab() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname === ASISTENTE_PATH) return null;
  return (
    <>
      <div className={styles.reserve} aria-hidden="true" />
      <Link href={askHref(searchParams)} className={styles.fab} aria-label="Preguntar al asistente">
        <IconoAsistente size={ICON_SIZE} />
        <span className={styles.label}>{LABEL}</span>
      </Link>
    </>
  );
}

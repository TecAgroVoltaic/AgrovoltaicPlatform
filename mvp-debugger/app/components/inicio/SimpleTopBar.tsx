// La barra de arriba del modo simple: la marca a la izquierda y el conmutador de
// modo a la derecha. Lo que cada pantalla agrega (hilos, «Nueva») entra por las
// dos ranuras; con el chat apagado la barra va sola.
import type { ReactNode } from "react";

import { BrandMark } from "@/app/components/BrandMark";
import { ModeToggle } from "@/app/components/modo/ModeToggle";
import styles from "@/app/components/inicio/simpleTopBar.module.css";

export type SimpleTopBarProps = {
  /** Va antes de la marca (p. ej. abrir los hilos). */
  readonly start?: ReactNode;
  /** Va antes del conmutador (p. ej. «Nueva conversación»). */
  readonly end?: ReactNode;
};

export function SimpleTopBar({ start, end }: SimpleTopBarProps) {
  return (
    <header className={styles.bar}>
      {start}
      <h1 className={styles.brand}>
        <BrandMark />
        <span className={styles.brandName}>AgroVoltaic</span>
      </h1>
      <div className={styles.end}>
        {end}
        <ModeToggle current="simple" />
      </div>
    </header>
  );
}

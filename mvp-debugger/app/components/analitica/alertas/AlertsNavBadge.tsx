"use client";
// El contador de alertas graves abiertas junto a «Alertas» en el menú.
//
// Si el resumen falla, el menú sigue igual y sin contador: la navegación no
// puede depender de un servicio. Un cero tampoco se pinta: un «0» en el menú es
// ruido que se aprende a ignorar, y entonces se ignora también el «3».
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import styles from "@/app/components/analitica/alertas/navBadge.module.css";
import { useAlertsSummary } from "@/app/components/analitica/alertas/useAlertsData";

export function AlertsNavBadge() {
  const { state, reload } = useAlertsSummary();
  const pathname = usePathname();
  const firstPath = useRef(pathname);

  // Cambiar de sección es «volver a la vista»: el cascarón no se vuelve a
  // montar al navegar, así que sin esto el número quedaría el de la carga.
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    reload();
  }, [pathname, reload]);

  if (state.status !== "ready" || state.data.openCritical === 0) return null;
  const count = state.data.openCritical;
  // El número se ve; la frase se lee. Un `aria-label` en un `span` sin rol no
  // lo anuncian todos los lectores de pantalla.
  return (
    <span className={styles.navCount}>
      <span aria-hidden="true">{count}</span>
      <span className={styles.srOnly}>
        , {count} {count === 1 ? "alerta grave abierta" : "alertas graves abiertas"}
      </span>
    </span>
  );
}

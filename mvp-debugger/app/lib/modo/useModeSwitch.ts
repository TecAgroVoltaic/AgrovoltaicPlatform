"use client";
// La única puerta para cambiar de modo desde el navegador: fija la cookie y lleva
// a la casa del modo elegido. `refresh` hace que el servidor vuelva a leer la
// cookie, así que `/` decide con el modo nuevo y no con el de la caché.
import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { MODE_HOME, serializeModeCookie, type Mode } from "@/app/lib/modo/mode";

export function useModeSwitch(): (mode: Mode) => void {
  const router = useRouter();
  return useCallback(
    (mode: Mode) => {
      document.cookie = serializeModeCookie(mode);
      router.push(MODE_HOME[mode]);
      router.refresh();
    },
    [router],
  );
}

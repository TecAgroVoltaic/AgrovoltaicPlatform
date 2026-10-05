"use client";
// El tema, vivo: se relee cuando la consola cambia `data-theme`, cuando cambia
// la preferencia del sistema y cuando cambia la de movimiento reducido.
//
// Devuelve `null` en el servidor y en el primer render: las variables CSS solo
// existen en el DOM. Quien lo consume trata ese `null` como "todavía cargando",
// que es lo honesto: sin colores no hay gráfico que pintar.
import { useEffect, useState } from "react";

import { readChartTheme, type ChartTheme } from "@/app/components/charts/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useChartTheme(): ChartTheme | null {
  const [theme, setTheme] = useState<ChartTheme | null>(null);

  useEffect(() => {
    const colorScheme = window.matchMedia(DARK_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    const refresh = () =>
      setTheme(readChartTheme(document.documentElement, !reducedMotion.matches));

    refresh();
    // El interruptor de tema de la consola escribe `data-theme` en <html>: es la
    // única señal de que la paleta cambió, porque el CSS no avisa.
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    colorScheme.addEventListener("change", refresh);
    reducedMotion.addEventListener("change", refresh);

    return () => {
      observer.disconnect();
      colorScheme.removeEventListener("change", refresh);
      reducedMotion.removeEventListener("change", refresh);
    };
  }, []);

  return theme;
}

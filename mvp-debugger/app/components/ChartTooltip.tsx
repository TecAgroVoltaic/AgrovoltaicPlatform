"use client";
// Tooltip global: un único div fijo + delegación en document sobre `[data-tip]`.
// Sobrevive el redibujo de los SVG (que se inyectan con dangerouslySetInnerHTML).
// Se monta una sola vez en la consola, y lo usan tanto las gráficas como los
// nodos del grafo de arquitectura y la barra lateral compacta.
//
// La posición se calcula acá (no con un transform en CSS) porque hay que
// ACOTARLA a la ventana: un rótulo largo sobre un icono de 60 px de ancho se
// salía por la izquierda.
import { useEffect, useRef } from "react";

// Aire mínimo contra el borde de la ventana y contra el elemento señalado.
const MARGEN = 8;
const SEPARACION = 8;

export function ChartTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    const over = (e: PointerEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (!el) return;
      const texto = el.getAttribute("data-tip");
      if (!texto) return;                       // data-tip vacío = sin tooltip
      const r = el.getBoundingClientRect();
      tip.textContent = texto;
      // Se muestra ANTES de medir: oculto, offsetWidth es 0 y el ajuste no sirve.
      tip.hidden = false;
      const { offsetWidth: w, offsetHeight: h } = tip;
      // Centrado sobre el elemento, pero SIEMPRE dentro de la ventana. Sin esto
      // un rótulo largo sobre la barra lateral compacta (60 px) se salía por la
      // izquierda, y lo mismo pasaba con las gráficas pegadas al borde derecho.
      const x = Math.min(Math.max(MARGEN, r.left + r.width / 2 - w / 2),
                         innerWidth - w - MARGEN);
      // Arriba del elemento; si no cabe, debajo.
      const arriba = r.top - h - SEPARACION;
      tip.style.left = `${Math.max(MARGEN, x)}px`;
      tip.style.top = `${arriba < MARGEN ? r.bottom + SEPARACION : arriba}px`;
    };
    const out = (e: PointerEvent) => {
      if ((e.target as Element).closest?.("[data-tip]")) tip.hidden = true;
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
    };
  }, []);
  return <div id="tip" ref={ref} hidden />;
}

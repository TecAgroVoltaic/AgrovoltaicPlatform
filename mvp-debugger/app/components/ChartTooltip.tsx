"use client";
// Tooltip global de las gráficas: un único div fijo + delegación en document.
// Sobrevive el redibujo de los SVG (que se inyectan con dangerouslySetInnerHTML).
// Se monta una sola vez en la consola.
import { useEffect, useRef } from "react";

export function ChartTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    const over = (e: PointerEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      tip.textContent = el.getAttribute("data-tip") || "";
      tip.style.left = r.left + r.width / 2 + "px";
      tip.style.top = r.top + "px";
      tip.hidden = false;
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

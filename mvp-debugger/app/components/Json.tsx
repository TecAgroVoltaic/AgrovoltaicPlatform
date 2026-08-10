"use client";
// Bloque JSON legible (salida cruda de tools / respuestas). Colapsable.
import { useState } from "react";

export function Json({ value, collapsed = false }: { value: any; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  const texto = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="json">
      <button className="json-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} {open ? "ocultar" : "ver"} JSON ({texto.length} chars)
      </button>
      {open && <pre className="json-pre">{texto}</pre>}
    </div>
  );
}

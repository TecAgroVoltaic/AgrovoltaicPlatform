"use client";
// Helpers de fetch del lado cliente: siempre pegan a /api/* (nunca directo al
// servicio Python), asi la key queda del lado servidor. Devuelven {status, data}
// para poder mostrar errores del upstream sin que la UI explote.

export type Resp<T = any> = { status: number; ok: boolean; data: T };

export async function jget<T = any>(url: string): Promise<Resp<T>> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, data };
  } catch (e: any) {
    return { status: 0, ok: false, data: { error: String(e?.message || e) } as any };
  }
}

export async function jpost<T = any>(url: string, body: any): Promise<Resp<T>> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, data };
  } catch (e: any) {
    return { status: 0, ok: false, data: { error: String(e?.message || e) } as any };
  }
}

// --- formato ---------------------------------------------------------------
export function nfmt(v: any, dec = 1): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return n.toLocaleString("es-CR", { maximumFractionDigits: dec });
}

export function whToKwh(wh: any): string {
  const n = Number(wh);
  if (!isFinite(n)) return "—";
  return (n / 1000).toLocaleString("es-CR", { maximumFractionDigits: 1 }) + " kWh";
}

// Markdown minimo (negrita + saltos) — suficiente para leer la respuesta del
// agente en un debugger, sin sumar una libreria.
export function inlineMd(texto: string): string {
  const esc = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

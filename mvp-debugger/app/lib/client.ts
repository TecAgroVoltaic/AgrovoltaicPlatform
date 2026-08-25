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

// Markdown minimo (negrita + saltos): suficiente para leer la respuesta del
// agente en un debugger, sin sumar una libreria.
export function inlineMd(texto: string): string {
  const esc = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// --- lectura defensiva de respuestas ---------------------------------------
// Las vistas consumen /api/* y asumian la forma de la respuesta: un 200 con otro
// shape hacia que `.map` lanzara DENTRO del .then, dejando la promesa rechazada
// y la UI en "cargando..." para siempre. Estos helpers convierten eso en un
// estado de error explicito y accionable.

// El servidor de datos NO esta encendido las 24 horas: un programador de AWS lo
// apaga a las 19:00 y lo enciende a las 07:00, de lunes a viernes, y el fin de
// semana lo deja apagado. Es una decision de costo, no una falla, y la consola
// tiene que decirlo asi. Un "502 Bad Gateway" a las 3 de la manana manda a
// alguien a buscar un bug que no existe.
export const HORARIO = "de lunes a viernes, 07:00 a 19:00 (hora de Costa Rica)";
export const MSG_APAGADO =
  `el servidor de datos está apagado. Se enciende ${HORARIO}`;

/** true si el fallo es "el servicio de atras no esta ahi", y no otra cosa.
 *
 * El proxy de /api/* devuelve 502 con `servicio inaccesible` cuando no logra
 * conectar; el 0 es que ni siquiera salio el fetch; el 504 es que salio y no
 * volvio. Los tres significan lo mismo para quien mira la pantalla. Un 401 o un
 * 422 NO entran: esos son fallos de verdad y hay que verlos como tales. */
export function servidorApagado(r: Resp): boolean {
  if (r.status === 0 || r.status === 502 || r.status === 504) return true;
  const d = r.data as any;
  return typeof d?.error === "string" && d.error.includes("servicio inaccesible");
}

/** Mensaje legible de una respuesta fallida (detail de FastAPI, error del proxy, o el status). */
export function mensajeError(r: Resp): string {
  if (servidorApagado(r)) return MSG_APAGADO;
  const d = r.data as any;
  if (typeof d?.detail === "string") return d.detail;
  if (typeof d?.error === "string") return d.error;
  if (r.status === 401) return "sesión vencida: recargá la página para volver a entrar";
  return `el servicio respondió ${r.status}`;
}

/** Extrae una lista de un campo, validando la forma. Nunca lanza. */
export function extraerLista(r: Resp, campo: string): { lista: any[]; error: string | null } {
  if (!r.ok) return { lista: [], error: mensajeError(r) };
  const valor = (r.data as any)?.[campo];
  if (!Array.isArray(valor)) {
    return { lista: [], error: `respuesta inesperada: falta "${campo}"` };
  }
  return { lista: valor, error: null };
}

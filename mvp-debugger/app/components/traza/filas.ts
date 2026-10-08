// Cómo se reduce la salida de una herramienta a filas (etiqueta, valor)
// legibles: valores cortos, objetos chicos en una línea y, de la salida, solo
// los campos que aportan.

export type Paso = any;

/** Un valor que se lee como número y se alinea como tal. */
export const NUM = /^[+-]?\d+([.,]\d+)?$/;

// Marcadores que la interfaz dibuja (ChartSpec y DescargaSpec): volcarlos acá
// sería repetir en texto lo que ya se ve como gráfico o como tarjeta.
const PINTADOS = new Set(["_grafico", "_descarga"]);

// Campos que valen la pena de la salida de una herramienta, en orden. El resto
// (los que repiten la entrada, la nota larga) va a la salida cruda.
const DESTACADOS = [
  "punto_consultado", "valor_esperado", "banda", "medido", "ancla",
  "estado", "resumen", "metricas", "contexto", "anomalias", "n",
];

/** Un valor suelto, corto y legible. Los arreglos no se vuelcan: se cuentan. */
function valorCorto(v: any): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "elemento" : "elementos"}`;
  if (typeof v === "object") return `${Object.keys(v).length} campos`;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  const s = String(v);
  return s.length > 110 ? s.slice(0, 110) + "…" : s;
}

/** Objeto chico y plano -> "k v · k v". Es lo que hace legible `metricas`. */
function objetoEnLinea(o: Record<string, any>): string | null {
  const claves = Object.keys(o);
  if (!claves.length || claves.length > 6) return null;
  if (claves.some((k) => o[k] !== null && typeof o[k] === "object")) return null;
  return claves.map((k) => `${k} ${valorCorto(o[k])}`).join(" · ");
}

/**
 * Filas (etiqueta, valor) de un dict. Los objetos anidados se ABREN un nivel
 * (`resumen.maximo_real`): justo esos campos son los que uno quiere cotejar
 * contra la pantalla.
 */
export function filas(obj: any, prefijo = ""): [string, string][] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object" || Array.isArray(obj)) return [[prefijo, valorCorto(obj)]];
  const salida: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (PINTADOS.has(k)) continue;              // el gráfico y la descarga se pintan, no se listan
    const clave = prefijo ? `${prefijo}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const enLinea = objetoEnLinea(v as any);
      if (enLinea) { salida.push([clave, enLinea]); continue; }
      if (!prefijo) { salida.push(...filas(v, clave)); continue; }
      salida.push([clave, valorCorto(v)]);
      continue;
    }
    salida.push([clave, valorCorto(v)]);
  }
  return salida;
}

/** Solo los campos que aportan, en el orden en que se quieren leer. */
export function filasDestacadas(salida: any): { filas: [string, string][]; ocultos: number } {
  if (!salida || typeof salida !== "object" || Array.isArray(salida)) {
    return { filas: filas(salida), ocultos: 0 };
  }
  const claves = Object.keys(salida).filter((k) => !PINTADOS.has(k));
  const elegidas = DESTACADOS.filter((k) => k in salida && salida[k] !== null);
  if (!elegidas.length) return { filas: filas(salida), ocultos: 0 };
  const sub: Record<string, any> = {};
  for (const k of elegidas) sub[k] = salida[k];
  return { filas: filas(sub), ocultos: claves.length - elegidas.length };
}

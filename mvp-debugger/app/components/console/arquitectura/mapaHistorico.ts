// Forma del mapa que sirve `GET /historico/arquitectura`, y sus helpers.
//
// Es un archivo APARTE del de `mapa.ts` (el del Predictivo) a propósito, y no por
// pereza de unificar: los dos agentes no tienen la misma arquitectura y forzarlos
// a un tipo común obligaría a que todo fuera opcional, con lo cual el tipo dejaría
// de decir nada. El Predictivo se organiza por MODOS (la garantía es qué
// herramienta está ausente); el Histórico se organiza por FAMILIAS, y su garantía
// vive en otro lado: la detección corre fuera del agente y el pool es de solo
// lectura.
//
// Lo único que comparten es la forma de una herramienta (nombre + `input_schema`),
// y eso sí se reusa: `Herramienta` de `mapa.ts` con `modos` opcional.

import type { Esquema } from "./mapa";

export type HerramientaHist = {
  nombre: string;
  familia: string;
  descripcion: string;
  input_schema: Esquema;
  /** ¿Su payload lleva el bloque `confianza`? Lo detecta el servicio, no se declara. */
  incrusta_confianza: boolean;
  ejecutor: string;
};

export type Familia = {
  herramientas: string[];
  objetivo: string | null;
};

export type Umbral = {
  clave: string;
  valor: number;
  que_decide: string;
};

export type TipoHallazgo = { tipo: string; que_es: string };

export type Garantia = { que: string; como: string };

export type MapaHistorico = {
  agente: string;
  nombre: string;
  objetivo: string;
  modelo: string;
  familias: Record<string, Familia>;
  herramientas: HerramientaHist[];
  umbrales: Umbral[];
  hallazgos: {
    tipos: TipoHallazgo[];
    severidades: string[];
    veredictos: string[];
  };
  deteccion: {
    modo: string;
    escribe: string[];
    por_que: string;
  };
  garantias: Garantia[];
  limites: { historial_mensajes: number; max_tokens: number };
};

/** ¿El JSON que llegó es realmente el mapa del Histórico?
 *
 * Existe por un fallo concreto: la vista de arquitectura tiene una copia guardada
 * para cuando el servidor está apagado, y si el chequeo fuera laxo, un mapa del
 * OTRO agente pasaría por bueno y se dibujaría con el rótulo equivocado. Un mapa
 * de arquitectura incorrecto sin cartel de error es peor que una pantalla vacía:
 * nadie lo verifica, porque parece que ya está.
 */
export function esMapaHistorico(x: unknown): x is MapaHistorico {
  const m = x as MapaHistorico | null;
  return !!m && m.agente === "historico"
    && !!m.familias && typeof m.familias === "object"
    && Array.isArray(m.herramientas) && Array.isArray(m.umbrales);
}

/** Familias en orden estable: análisis primero, calidad después, resto al final. */
const ORDEN = ["analisis", "calidad"];
export function familiasOrdenadas(m: MapaHistorico): [string, Familia][] {
  return Object.entries(m.familias ?? {}).sort(
    (a, b) => (ORDEN.indexOf(a[0]) + 1 || 99) - (ORDEN.indexOf(b[0]) + 1 || 99),
  );
}

/** Un umbral formateado como se lee: 0.8 -> «0,80», 3 -> «3». */
export function valorUmbral(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toLocaleString("es-CR", { minimumFractionDigits: 2 });
}

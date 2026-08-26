// Forma del mapa que sirve `GET /arquitectura`, y los helpers que lo leen.
//
// Todo lo de acá es lectura defensiva: el servicio es la fuente de verdad, pero
// la vista no puede romperse porque un bloque venga distinto o falte. Un fallo
// del store, por ejemplo, degrada `datos` sin tumbar el resto del mapa.

export type Prop = {
  type?: string;
  enum?: string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
};

export type Esquema = {
  type?: string;
  properties?: Record<string, Prop>;
  required?: string[];
  additionalProperties?: boolean;
};

export type Herramienta = {
  nombre: string;
  descripcion: string;
  input_schema: Esquema;
  /** Solo el Predictivo se organiza por modos; el Histórico no tiene. */
  modos?: string[];
  ejecutor: string;
};

export type Modo = {
  herramientas: string[];
  web_search: boolean;
  objetivo: string | null;
};

export type Cobertura = {
  desde?: string | null;
  hasta?: string | null;
  n?: number;
  unidad?: string | null;
  error?: string;
};

export type Mapa = {
  agente: {
    nombre: string; modelo: string; lazo: string;
    sitio: { nombre: string; lat: number; lon: number; alt: number; tz: string };
  };
  modos: Record<string, Modo>;
  herramientas: Herramienta[];
  web_search: { nombre: string; tipo: string; max_uses: number | null; ejecutor: string; modos: string[] };
  limites: {
    horizonte_seg: { min: number; max: number } | null;
    llm_por_min: number;
    datos_por_min: number;
    presupuesto_diario_usd: number;
    umbral_cielo_despejado: number;
    historial_mensajes: number;
    max_tokens: number;
  };
  datos: Record<string, Cobertura>;
};

/** Fila de la tabla «qué recibe», derivada del input_schema real. */
export type Param = {
  nombre: string;
  tipo: string;
  obligatorio: boolean;
  detalle: string;
};

/** Traduce un `input_schema` de Anthropic a filas legibles. Sin inventar nada. */
export function parametros(esquema: Esquema | undefined): Param[] {
  const props = esquema?.properties || {};
  const req = new Set(esquema?.required || []);
  return Object.entries(props).map(([nombre, p]) => {
    const partes: string[] = [];
    if (p.enum?.length) partes.push(p.enum.map((e) => `\`${e}\``).join(" · "));
    if (p.minimum !== undefined && p.maximum !== undefined) {
      partes.push(`${p.minimum} – ${p.maximum}`);
    } else if (p.minimum !== undefined) partes.push(`≥ ${p.minimum}`);
    else if (p.maximum !== undefined) partes.push(`≤ ${p.maximum}`);
    if (p.description) partes.push(p.description);
    return {
      nombre,
      tipo: p.enum?.length ? "enum" : (p.type || "—"),
      obligatorio: req.has(nombre),
      detalle: partes.join(" · "),
    };
  });
}

/** Modos declarados, en el orden en que los publica el servicio. */
export function nombresDeModos(mapa: Mapa | null): string[] {
  return mapa ? Object.keys(mapa.modos) : [];
}

/** Fecha corta y legible; tolera nulos y basura. */
export function dia(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? String(iso).slice(0, 10)
    : d.toLocaleDateString("es-CR", { year: "numeric", month: "short", day: "2-digit" });
}

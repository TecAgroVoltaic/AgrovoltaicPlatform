export type Variable = {
  ultimo_dato: string | null;
  edad_horas: number | null;
  filas: number;
  estado: "ok" | "stale" | "sin_datos";
};
export type Corrida = {
  ts: string | null; edad_horas: number | null; ok?: boolean;
  filas_leidas?: number; filas_insertadas?: number; duracion_seg?: number;
  por_variable?: Record<string, { leidas: number; insertadas: number; error: string | null }>;
};
export type Fuente = {
  host: string | null; puerto: number | null; base: string | null;
  tipo: "replica_dump" | "base_viva" | "replica_remota" | "desconocido";
  etiqueta: string; es_snapshot: boolean | null;
  criterio: string; definida_en: string;
  targets?: { variable: string; caja: string; unidad: string }[];
  error?: string;
};
export type Panel = {
  estado: string;
  consultado_en?: string;
  fuente?: Fuente;
  store?: { host: string | null; puerto: number | null; base: string | null; etiqueta?: string };
  ingesta: {
    estado?: string; umbral_stale_horas: number; error?: string;
    variables: Record<string, Variable>;
    congelamiento?: { congelada: boolean; desde: string | null; dias: number | null };
    ultima_corrida_etl?: Corrida;
    ultimo_error_etl?: { ts: string; edad_horas: number | null; evento: string; error: string | null };
    etl_fallando?: boolean;
  };
  errores_recientes: { ts: string; componente: string; evento: string; error: string | null }[];
  presupuesto: { gastado_hoy_usd: number; tope_usd: number; agotado: boolean; medido: boolean };
  ultima_prediccion: { creado_en: string; variable: string; valor_esperado: number | null;
                       unidad: string | null } | null;
};

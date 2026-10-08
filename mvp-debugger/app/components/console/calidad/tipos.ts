export type Veredicto = "ok" | "aviso" | "grave" | "sin_datos";

export type Dia = {
  fecha: string;
  filas_radiacion: number; filas_electrico: number;
  graves_rad: number; avisos_rad: number;
  graves_ele: number; avisos_ele: number;
  clase: string | null; kt_medio: number | null; indice_variabilidad: number | null;
  veredicto: Veredicto; veredicto_radiacion: Veredicto; veredicto_electrico: Veredicto;
};

export type Tipo = {
  fuente: string; tipo: string; severidad: "grave" | "aviso" | "info";
  dias: number; variables: number; lecturas: number | null;
  primer_dia: string; ultimo_dia: string;
};

// Lo que la vista necesita para pintar. NO es lo que devuelve el servicio: eso lo
// traduce `normalizar`.
export type Resumen = {
  periodo: { desde: string; hasta: string };
  cobertura: { dias_con_datos: number; dias_calendario: number };
  cielo: {
    dias: number; kt_medio: number | null; vi_medio: number | null;
    despejados: number; parciales: number; cubiertos: number; variables: number;
    pct_del_techo: number | null;
  };
  tipos: Tipo[];
};

export type Hallazgo = {
  fecha: string; fuente: string; variable: string; tipo: string;
  severidad: "grave" | "aviso" | "info"; n_afectadas: number | null;
  detalle: Record<string, any>;
};

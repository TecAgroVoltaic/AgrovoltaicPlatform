// Payloads REALES del Agente Histórico, recortados. Solo los usan las pruebas.
//
// Recortados en NÚMERO de filas, nunca en forma: se conservan los casos que
// rompen contratos ingenuos (`lecturas: null`, un período sin `por_variable`,
// `fraccion` y `advertencia` en null) porque son los que de verdad llegan.
// Copiados de `GET /calidad/*` y `GET /arquitectura` el 2026-09-01.
const AVAILABILITY_NOTE =
  "dias con el inversor sin acoplar entre las 07:00 y las 17:00. NO baja `dias_utilizables`: " +
  "el DATO de esos dias es correcto, lo que fallo es el EQUIPO.";

export const AVAILABILITY_WARNING =
  "la planta estuvo parada en horario operativo 96 de 274 dias con datos (69 de ellos con sol " +
  "pleno): la generacion del periodo es real pero NO representa la capacidad del sistema. Es " +
  "una averia que revisar, no un problema de calidad de dato";

export const SPREAD_WARNING =
  "las variables NO van juntas: la peor tiene 25 dias utilizables y la mejor 241 de 569. " +
  "Mira `por_variable` antes de leer cada numero";

export const USABILITY_NOTE =
  "un dia es 'no utilizable' cuando un problema grave toca al menos la quinta parte de sus " +
  "lecturas, o cuando le falta media jornada";

export const VIGILANCE_NOTE =
  "`sin_vigilancia` NO significa `sin hallazgos`, y la respuesta separa las dos cosas a " +
  "proposito porque confundirlas hace afirmar algo falso. `hallazgos_en_el_periodo` cuenta los " +
  "que SI existen para esa clave (la POA tiene, y aun asi nadie la barre), y " +
  "`cuentan_para_el_veredicto` dice si `confianza` puede verlos. En los cuatro motivos, cero " +
  "hallazgos no es un aprobado: es un examen en blanco.";

/** El bloque real: la POA acumula 1.089 hallazgos y ninguno pesa jamás; el
 * albedo no está vigilado y sin embargo SÍ pesa. Son dos ejes distintos. */
export const VIGILANCE_WIRE = {
  vigiladas: ["potencia_pv1_w", "voltaje_pv1_v", "frecuencia_hz"],
  sin_vigilancia: [
    {
      clave: "poa_pv1_wm2",
      familia: "radiacion",
      fuente: "radiacion_sc_poa",
      motivo: "fuente_sin_denominador",
      hallazgos_en_el_periodo: 1089,
      cuentan_para_el_veredicto: false,
    },
    {
      clave: "albedo",
      familia: "radiacion",
      fuente: "radiacion_sc_15s",
      motivo: "columna_no_barrida",
      hallazgos_en_el_periodo: 886,
      cuentan_para_el_veredicto: true,
    },
    {
      clave: "kt_star",
      familia: "radiacion",
      fuente: null,
      motivo: "variable_derivada",
      hallazgos_en_el_periodo: 1073,
      cuentan_para_el_veredicto: false,
    },
    {
      clave: "velocidad_viento_ms",
      familia: "ambiental",
      fuente: null,
      motivo: "sin_fuente_en_la_base",
      hallazgos_en_el_periodo: 0,
      cuentan_para_el_veredicto: false,
    },
  ],
  fuentes_del_veredicto: ["monitoreo_sc_electrico", "radiacion_sc_15s"],
  nota: VIGILANCE_NOTE,
};

/** El ranking que ya viene ordenado por días afectados. `lecturas: null` en el
 * último es real: no todos los detectores cuentan lecturas. */
export const TOP_PROBLEMS_WIRE = [
  { tipo: "fuera_de_rango", severidad: "grave", dias: 232, variables: 11, lecturas: 37812 },
  { tipo: "columna_ausente", severidad: "grave", dias: 190, variables: 13, lecturas: 110731 },
  { tipo: "cambio_de_cadencia", severidad: "info", dias: 15, variables: 1, lecturas: null },
];

export const SUMMARY_WIRE = {
  calidad: {
    periodo: { desde: "2024-11-10", hasta: "2026-06-02" },
    veredicto: {
      dias_en_rango: 569,
      dias_con_datos: 274,
      dias_utilizables: 25,
      cobertura: 0.044,
      advertencia: SPREAD_WARNING,
      medido_sobre: ["potencia_pv1_w", "voltaje_pv1_v", "frecuencia_hz"],
      disponibilidad: {
        dias_con_planta_parada: 96,
        dias_parada_bajo_sol: 69,
        de_dias_con_datos: 274,
        fraccion: 0.35,
        advertencia: AVAILABILITY_WARNING,
        nota: AVAILABILITY_NOTE,
      },
      por_variable: {
        potencia_pv1_w: { dias_utilizables: 219, cobertura: 0.385 },
        voltaje_pv1_v: { dias_utilizables: 241, cobertura: 0.424 },
        frecuencia_hz: { dias_utilizables: 25, cobertura: 0.044 },
      },
    },
    problemas_mas_frecuentes: TOP_PROBLEMS_WIRE,
    nota: USABILITY_NOTE,
  },
  tipos: [
    {
      fuente: "monitoreo_sc_electrico",
      tipo: "inversor_sin_acoplar",
      severidad: "grave",
      dias: 69,
      variables: 3,
      lecturas: 10334,
      primer_dia: "2025-09-22",
      ultimo_dia: "2026-06-01",
    },
    {
      fuente: "monitoreo_sc_electrico",
      tipo: "ruido_excesivo",
      severidad: "aviso",
      dias: 214,
      variables: 16,
      lecturas: 13902,
      primer_dia: "2025-09-05",
      ultimo_dia: "2026-06-01",
    },
    {
      fuente: "radiacion_sc_15s",
      tipo: "cambio_de_cadencia",
      severidad: "info",
      dias: 15,
      variables: 1,
      lecturas: null,
      primer_dia: "2025-09-24",
      ultimo_dia: "2026-03-10",
    },
  ],
  vigilancia: VIGILANCE_WIRE,
};

export const EMPTY_SUMMARY_WIRE = {
  calidad: {
    periodo: { desde: "2025-02-01", hasta: "2025-02-10" },
    veredicto: {
      dias_en_rango: 9,
      dias_con_datos: 0,
      dias_utilizables: 0,
      cobertura: 0,
      advertencia: "el periodo no tiene datos: cualquier numero de arriba es de un rango vacio",
      medido_sobre: ["potencia_pv1_w"],
      disponibilidad: {
        dias_con_planta_parada: 0,
        dias_parada_bajo_sol: 0,
        de_dias_con_datos: 0,
        fraccion: null,
        advertencia: null,
        nota: AVAILABILITY_NOTE,
      },
    },
    problemas_mas_frecuentes: [],
    nota: USABILITY_NOTE,
  },
  tipos: [],
  vigilancia: VIGILANCE_WIRE,
};

function day(date: string, overrides: Record<string, unknown> = {}) {
  return {
    fecha: date,
    filas_radiacion: 0,
    filas_electrico: 0,
    graves_rad: 0,
    avisos_rad: 0,
    materiales_rad: 0,
    graves_ele: 0,
    avisos_ele: 0,
    materiales_ele: 0,
    lecturas_sin_acoplar: 0,
    parada_bajo_sol: false,
    clase: null,
    kt_medio: null,
    indice_variabilidad: null,
    planta_parada: false,
    veredicto_radiacion: "sin_datos",
    veredicto_electrico: "sin_datos",
    veredicto: "sin_datos",
    ...overrides,
  };
}

export const DAYS_WIRE = {
  periodo: { desde: "2025-09-01", hasta: "2025-09-05" },
  dias: [
    day("2025-09-01"),
    day("2025-09-02", {
      filas_electrico: 150,
      veredicto: "ok",
      veredicto_electrico: "ok",
      veredicto_radiacion: "ok",
      clase: "despejado",
    }),
    day("2025-09-03", {
      filas_electrico: 72,
      graves_ele: 35,
      avisos_ele: 12,
      lecturas_sin_acoplar: 28,
      parada_bajo_sol: true,
      planta_parada: true,
      clase: "parcial",
      veredicto: "grave",
      veredicto_electrico: "grave",
      veredicto_radiacion: "aviso",
    }),
  ],
};

export const FINDINGS_WIRE = {
  periodo: { desde: "2024-11-10", hasta: "2026-06-02" },
  total: 26023,
  devueltos: 1,
  truncado: true,
  pagina: { offset: 0, limite: 50, hay_mas: true, siguiente_offset: 50 },
  orden: "(severidad = 'grave') DESC, fecha DESC, tipo, variable, fuente",
  hallazgos: [
    {
      fecha: "2026-06-01",
      fuente: "monitoreo_sc_electrico",
      variable: "frecuencia_hz",
      tipo: "inversor_sin_acoplar",
      severidad: "grave",
      n_afectadas: 83,
      detalle: {
        de: 155,
        nota: "el inversor no se acoplo con sol pleno: el DATO es correcto, lo que fallo es el EQUIPO",
        ventana: "07:00-17:00",
      },
      que_es:
        "el inversor no se acopló a la red entre las 07:00 y las 17:00: el DATO es bueno, lo que falló fue el EQUIPO",
    },
  ],
};

export const GLOSSARY_WIRE = {
  hallazgos: {
    tipos: [
      { tipo: "saturado_85", que_es: "85 °C constante: el DS18B20 está desconectado" },
      { tipo: "ruido_excesivo", que_es: "variación entre lecturas muy por encima de la habitual del día" },
      { tipo: "cambio_de_cadencia", que_es: "el intervalo de muestreo cambió respecto al día anterior" },
      {
        tipo: "inversor_sin_acoplar",
        que_es:
          "el inversor no se acopló a la red entre las 07:00 y las 17:00: el DATO es bueno, lo que falló fue el EQUIPO",
      },
    ],
  },
};

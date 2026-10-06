// Respuestas de `/alertas/*` tal como las define el contrato §4.5, en el idioma
// del cable. Las usan los tests de contrato, de cliente y de componentes: una
// sola copia para que todos prueben contra la misma forma.
//
// Las cifras salen de casos reales del proyecto: el 2026-08-26 y el 2026-08-31
// la planta generó cero todo el día con más de 1.000 W/m² (código de error 302).

export const INVERTER_ALERT_WIRE = {
  id: 41,
  clave: "inversor_parado_con_sol:electrica:*",
  tipo: "inversor_parado_con_sol",
  severidad: "grave",
  estado: "nueva",
  titulo: "Inversor sin generar con sol pleno",
  descripcion:
    "El inversor no exportó energía en todo el día mientras la irradiancia superó los 1.000 W/m².",
  fuente: "electrica",
  variable: "*",
  fecha_inicio: "2026-08-26",
  fecha_fin: "2026-08-31",
  ocurrencias: 2,
  evidencia: {
    fechas: ["2026-08-26", "2026-08-31"],
    hallazgos: [
      { fecha: "2026-08-26", fuente: "electrica", variable: "*", tipo: "inversor_sin_acoplar" },
      { fecha: "2026-08-31", fuente: "electrica", variable: "*", tipo: "inversor_sin_acoplar" },
    ],
    cifras: { ghi_max_wm2: 1043.5, energia_dia_kwh: 0, codigo_error: 302, nota_equipo: null },
  },
  proxima_revision: null,
  creada_en: "2026-09-01T12:05:00+00:00",
  actualizada_en: "2026-09-01T12:05:00+00:00",
  ultima_ocurrencia_en: "2026-09-01T12:05:00+00:00",
} as const;

export const SATURATED_ALERT_WIRE = {
  ...INVERTER_ALERT_WIRE,
  id: 42,
  clave: "sensor_temperatura_saturado:electrica:temp_vertical",
  tipo: "sensor_temperatura_saturado",
  severidad: "aviso",
  estado: "en_seguimiento",
  titulo: "Sensor DS18B20 saturado en 85 °C",
  descripcion: "El sensor del arreglo vertical devolvió 85,0 °C, el valor de un DS18B20 desconectado.",
  variable: "temp_vertical",
  fecha_inicio: "2026-07-02",
  fecha_fin: "2026-07-19",
  ocurrencias: 9,
  evidencia: { fechas: ["2026-07-02", "2026-07-19"], hallazgos: [], cifras: { lecturas_85: 412 } },
  proxima_revision: "2026-10-15",
} as const;

export const ALERTS_PAGE_WIRE = {
  total: 23,
  pagina: { offset: 0, limite: 20, hay_mas: true, siguiente_offset: 20 },
  alertas: [INVERTER_ALERT_WIRE, SATURATED_ALERT_WIRE],
};

export const EMPTY_ALERTS_PAGE_WIRE = {
  total: 0,
  pagina: { offset: 0, limite: 20, hay_mas: false, siguiente_offset: null },
  alertas: [],
};

export const ALERTS_SUMMARY_WIRE = {
  por_estado: { nueva: 3, reconocida: 1, en_seguimiento: 2, resuelta: 7, descartada: 4 },
  abiertas_graves: 3,
  abiertas_total: 6,
  ultima_evaluacion: "2026-10-06T06:00:00+00:00",
};

export const ALERT_DETAIL_WIRE = {
  alerta: INVERTER_ALERT_WIRE,
  eventos: [
    {
      id: 900,
      tipo: "creada",
      nota: null,
      autor: "evaluador",
      datos: { fecha: "2026-08-26" },
      creado_en: "2026-09-01T12:05:00+00:00",
    },
    {
      id: 901,
      tipo: "ocurrencia",
      nota: null,
      autor: "evaluador",
      datos: { fecha: "2026-08-31" },
      creado_en: "2026-09-01T12:05:01+00:00",
    },
  ],
  que_es:
    "El inversor no genera durante horas de sol pleno: suele ser una falla del equipo (código 302), no del dato.",
  enlaces: {
    calidad: "/calidad?desde=2026-08-26&hasta=2026-09-01",
    series: "/series?variables=potencia_total_wac&desde=2026-08-26&hasta=2026-09-01",
  },
};

export const INVALID_TRANSITION_WIRE = {
  codigo: "transicion_invalida",
  de: "descartada",
  a: "resuelta",
};

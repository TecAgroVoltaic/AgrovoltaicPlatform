// El cuerpo REAL de `GET /analitica/resumen?desde=2025-09-01&hasta=2026-06-02`,
// capturado del servicio con `curl` y recortado a las claves que el contrato
// lee (más algunas ajenas, para probar que las de sobra no rompen nada).
//
// Es un fixture y no un objeto inventado a propósito: un contrato probado contra
// datos imaginarios solo demuestra que el imaginario coincide consigo mismo.
// Solo lo importan los tests.

/** Copia profunda con parches, para que ningún test pise el fixture de otro. */
export function dashboardPayload(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(REAL_SUMMARY_BODY), ...patch };
}

const REAL_SUMMARY_BODY = {
  "ventana": {
    "desde": "2025-09-01",
    "hasta": "2026-06-02",
    "dias": 274,
    "granularidad": "semana"
  },
  "confianza": {
    "dias_en_rango": 274,
    "dias_con_datos": 228,
    "dias_utilizables": 48,
    "cobertura": 0.175,
    "advertencia": "las variables NO van juntas: la peor tiene 48 dias utilizables y la mejor 188 de 274. Mira `por_variable` antes de leer cada numero",
    "medido_sobre": [
      "energia_hoy_wh",
      "energia_total_wh",
      "potencia_pv1_w",
      "potencia_pv2_w"
    ],
    "disponibilidad": {
      "dias_con_planta_parada": 90,
      "dias_parada_bajo_sol": 69,
      "de_dias_con_datos": 228,
      "fraccion": 0.395,
      "advertencia": "la planta estuvo parada en horario operativo 90 de 228 dias con datos (69 de ellos con sol pleno): la generacion del periodo es real pero NO representa la capacidad del sistema. Es una averia que revisar, no un problema de calidad de dato"
    }
  },
  "actualizacion": {
    "ultimo_dato": "2026-06-01T17:55:00+00:00",
    "antiguedad_dias": 92,
    "estado": "detenida",
    "alarmante": true,
    "umbral_alarmante_dias": 7,
    "mensaje": "sin datos nuevos hace 92 dias, sobre un umbral de 7: el sistema dejo de reportar"
  },
  "energia_periodo": {
    "total_ac_kwh": {
      "valor": 1392.12,
      "n": 28965,
      "unidad": "kWh"
    },
    "inclinado_kwh": {
      "valor": 771.43,
      "n": 28996,
      "unidad": "kWh"
    },
    "vertical_kwh": {
      "valor": 544.26,
      "n": 28998,
      "unidad": "kWh"
    }
  },
  "energia_reciente": {
    "total_ac_kwh": {
      "valor": 38.0,
      "n": 995,
      "unidad": "kWh"
    },
    "inclinado_kwh": {
      "valor": 21.34,
      "n": 995,
      "unidad": "kWh"
    },
    "vertical_kwh": {
      "valor": 17.73,
      "n": 995,
      "unidad": "kWh"
    }
  },
  "rendimiento_especifico": {
    "inclinado": {
      "periodo_kwh_kwp": {
        "valor": 543.26,
        "n": 28996,
        "unidad": "kWh/kWp"
      },
      "anualizado_sobre_dias_con_datos_kwh_kwp_ano": {
        "valor": 869.7,
        "n": 28996,
        "unidad": "kWh/kWp/ano"
      }
    },
    "vertical": {
      "periodo_kwh_kwp": {
        "valor": 383.28,
        "n": 28998,
        "unidad": "kWh/kWp"
      },
      "anualizado_sobre_dias_con_datos_kwh_kwp_ano": {
        "valor": 613.6,
        "n": 28998,
        "unidad": "kWh/kWp/ano"
      }
    }
  },
  "energia_ac": {
    "registrada_kwh": {
      "valor": 1392.12,
      "n": 28965,
      "unidad": "kWh"
    },
    "planta_kwh": {
      "valor": 1572.2,
      "n": 14522,
      "unidad": "kWh"
    },
    "no_registrada_kwh": {
      "valor": 902.15,
      "n": 14522,
      "unidad": "kWh"
    },
    "dias_con_cierre_ac": 228,
    "dias_con_contador_de_vida": 105,
    "reinicios_del_contador_de_vida": 0,
    "significado": {
      "registrada_kwh": "(recortado)"
    }
  },
  "dias_con_datos": 228,
  "dias_ventana_reciente": 7,
  "ventana_reciente": {
    "desde": "2026-05-26",
    "hasta": "2026-06-02",
    "dias": 7,
    "granularidad": "dia"
  },
  "nota": "(nota del backend, recortada para el fixture)"
};

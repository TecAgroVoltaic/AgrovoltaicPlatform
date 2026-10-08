// Copia del mapa del agente, para cuando el servicio no responde.
//
// POR QUE EXISTE: la vista de arquitectura no muestra datos medidos, muestra la
// FORMA del agente (sus modos, sus herramientas, sus limites). Eso cambia cuando
// cambia el codigo, no cada cinco minutos, asi que no hay razon para que la
// pantalla se caiga cuando el servidor esta apagado de noche o el fin de semana.
//
// COMO SE USA: la vista pide el mapa vivo igual que antes. Si el servicio
// responde, gana el vivo. Si no, cae aca y ademas lo dice, para que nadie
// confunda una copia con la realidad.
//
// COMO SE REGENERA (cuando cambien modos, tools o limites):
//   curl -s -H "x-api-key: $CLAVE" \
//     https://agro.visione-edge.com/predictivo/arquitectura | python3 -m json.tool
//
// Capturado: 2026-08-25
//
// La lista de herramientas se reparte en `mapaRespaldo/` por el tope de 150
// líneas por archivo: al regenerar, cada herramienta va al archivo de su grupo.
import { HERRAMIENTAS_DIAGNOSTICO } from "./mapaRespaldo/herramientasDiagnostico";
import { HERRAMIENTAS_PRONOSTICO } from "./mapaRespaldo/herramientasPronostico";
import { HERRAMIENTAS_PREDICCION } from "./mapaRespaldo/herramientasPrediccion";

export const MAPA_RESPALDO = {
  "agente": {
    "nombre": "agente-predictivo",
    "modelo": "claude-haiku-4-5",
    "sitio": {
      "nombre": "San Carlos",
      "lat": 10.33,
      "lon": -84.42,
      "alt": 600.0,
      "tz": "America/Costa_Rica"
    },
    "lazo": "tool-use manual"
  },
  "modos": {
    "medicion_visible": {
      "herramientas": [
        "forecast",
        "backtest",
        "riesgo_de_nubes"
      ],
      "web_search": true,
      "objetivo": "El agente VE lo que midio el sensor. Sirve para juzgar el metodo despues del hecho: su trabajo es interpretar el resultado, no adivinarlo."
    },
    "medicion_oculta": {
      "herramientas": [
        "diagnosticar_condiciones",
        "contexto_historico",
        "riesgo_de_nubes",
        "predecir"
      ],
      "web_search": false,
      "objetivo": "El agente NO ve lo que midio el sensor. Pronostica de verdad. El juego de herramientas deja fuera la unica que lo revela, asi que la garantia no depende de que el modelo obedezca el prompt."
    }
  },
  "herramientas": [
    ...HERRAMIENTAS_PRONOSTICO,
    ...HERRAMIENTAS_DIAGNOSTICO,
    ...HERRAMIENTAS_PREDICCION,
  ],
  "web_search": {
    "nombre": "web_search",
    "tipo": "web_search_20250305",
    "max_uses": 3,
    "ejecutor": "anthropic",
    "modos": [
      "medicion_visible"
    ]
  },
  "limites": {
    "horizonte_seg": {
      "min": 60,
      "max": 21600
    },
    "llm_por_min": 12,
    "datos_por_min": 120,
    "presupuesto_diario_usd": 5.0,
    "umbral_cielo_despejado": 20.0,
    "historial_mensajes": 16,
    "max_tokens": 2048
  },
  "datos": {
    "irradiancia": {
      "desde": "2025-11-28T14:35:23-06:00",
      "hasta": "2026-07-23T02:31:22-06:00",
      "n": 31946,
      "unidad": "W/m2"
    },
    "humedad_suelo": {
      "desde": "2026-05-01T00:00:32-06:00",
      "hasta": "2026-07-23T02:32:06-06:00",
      "n": 138786,
      "unidad": "crudo"
    }
  }
} as const;

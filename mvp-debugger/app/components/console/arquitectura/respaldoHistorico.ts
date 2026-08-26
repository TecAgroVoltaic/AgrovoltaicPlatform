// Copia guardada del mapa del Agente Histórico. NO se edita a mano.
//
// Para qué: el servidor de datos se apaga fuera del horario laboral, y la
// arquitectura del agente no es un dato medido (no cambia con la hora, cambia con
// el código). Dejar la pantalla vacía a las 20:00 sería perder información que ya
// se tenía. La vista dibuja esta copia y lo dice con un cartel.
//
// Cómo se regenera, con el servicio arriba:
//
//   curl -s https://agro.visione-edge.com/historico/arquitectura \
//     | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=2))'
//
// y se pega abajo. Si queda vieja, la vista lo delata sola: compara el catálogo de
// prosa contra las herramientas del mapa y avisa de las diferencias en pantalla.
//
// Capturada del servicio en producción el 2026-08-26.
import type { MapaHistorico } from "./mapaHistorico";

export const RESPALDO_HISTORICO: MapaHistorico = {
  "agente": "historico",
  "nombre": "Histórico",
  "objetivo": "Responde que paso en el sistema PV de San Carlos, y si el dato en que se apoya la respuesta sirve.",
  "modelo": "claude-haiku-4-5",
  "familias": {
    "analisis": {
      "herramientas": [
        "energia_por_arreglo",
        "performance_ratio",
        "irradiancia_resumen",
        "temperatura_por_arreglo",
        "tendencia",
        "cobertura_datos",
        "catalogo_variables",
        "graficar"
      ],
      "objetivo": "Que paso: energia generada, performance ratio, irradiancia, temperatura y tendencias sobre el historico ya corregido."
    },
    "calidad": {
      "herramientas": [
        "calidad_periodo",
        "hallazgos_calidad",
        "cielo_periodo"
      ],
      "objetivo": "Si el dato sirve: completitud, validez, duplicados y como estuvo el cielo. Se responde LEYENDO el store de hallazgos, que escribe un barrido por lotes."
    }
  },
  "herramientas": [
    {
      "nombre": "energia_por_arreglo",
      "familia": "analisis",
      "descripcion": "Energia electrica generada (Wh) en un periodo: por arreglo (PV1 inclinado, PV2 vertical) y total AC del inversor. Omiti desde/hasta para todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO ('2026-01-01'), hora local CR. Omitir = desde el inicio."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = hasta el final del historico."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "performance_ratio",
      "familia": "analisis",
      "descripcion": "Performance Ratio (adimensional, ~0-1) por arreglo en un periodo: PV1 inclinado y PV2 vertical, ponderado por energia. Incluye la cobertura (n). Omiti desde/hasta para todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "irradiancia_resumen",
      "familia": "analisis",
      "descripcion": "Resumen de irradiancia solar en un periodo: GHI media/maxima (W/m2), indice de cielo despejado kt* (0-1, cuanto sol real vs cielo despejado) e insolacion total (Wh/m2). Solo datos validos con control de calidad. Omiti desde/hasta para todo el historico valido.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "temperatura_por_arreglo",
      "familia": "analisis",
      "descripcion": "Temperatura (C) de cada arreglo en un periodo: PV1 inclinado y PV2 vertical (media y maxima). Util para el efecto de temperatura en el rendimiento. Omiti desde/hasta para todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "tendencia",
      "familia": "analisis",
      "descripcion": "Resumen de la EVOLUCION en el tiempo de una metrica del sistema PV, por arreglo, SIN la serie completa (ideal para responder en texto). Metricas: 'potencia' (W por arreglo), 'irradiancia' (GHI W/m2), 'kt' (indice de claridad 0-1), 'pr' (performance ratio por arreglo), 'temperatura' (C por arreglo). Devuelve n, minimo, maximo y media por serie en el periodo. Usala cuando pregunten como evoluciono / la tendencia / el comportamiento de algo a lo largo del tiempo. Son agregados de datos reales; nunca inventes.",
      "input_schema": {
        "type": "object",
        "properties": {
          "metrica": {
            "type": "string",
            "enum": [
              "potencia",
              "irradiancia",
              "kt",
              "pr",
              "temperatura"
            ],
            "description": "Que metrica resumir."
          },
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR (opcional; omitir = todo el historico)."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO (opcional)."
          },
          "bucket": {
            "type": "string",
            "enum": [
              "day",
              "week",
              "month"
            ],
            "description": "Granularidad temporal del agregado. Default 'day'."
          }
        },
        "required": [
          "metrica"
        ],
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "cobertura_datos",
      "familia": "analisis",
      "descripcion": "Cobertura de datos: rango de fechas disponible y cuantas filas hay (electrico 5 min y radiacion 15 s) en el periodo. Sirve para saber si hay suficientes datos. Omiti desde/hasta para contar todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "catalogo_variables",
      "familia": "analisis",
      "descripcion": "Diccionario de las variables medidas (nombre, descripcion, a que tabla pertenece: electrico o radiacion). Usalo si preguntan que significa una columna/variable o que se mide.",
      "input_schema": {
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "graficar",
      "familia": "analisis",
      "descripcion": "Genera un GRAFICO de tendencia de una metrica del sistema PV para MOSTRARSELO al usuario. Usalo cuando el usuario quiera VER la evolucion en el tiempo (no solo un numero). Metricas: 'potencia' (W por arreglo), 'irradiancia' (GHI W/m2), 'kt' (indice de claridad), 'pr' (performance ratio por arreglo), 'temperatura' (C por arreglo). Devuelve los puntos reales de la base; nunca inventes una serie.",
      "input_schema": {
        "type": "object",
        "properties": {
          "metrica": {
            "type": "string",
            "enum": [
              "potencia",
              "irradiancia",
              "kt",
              "pr",
              "temperatura"
            ],
            "description": "Que graficar."
          },
          "desde": {
            "type": "string",
            "description": "Inicio ISO (opcional; omitir = todo)."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO exclusivo (opcional)."
          },
          "bucket": {
            "type": "string",
            "enum": [
              "day",
              "week",
              "month"
            ],
            "description": "Granularidad temporal. Default 'day'."
          }
        },
        "required": [
          "metrica"
        ],
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "calidad_periodo",
      "familia": "calidad",
      "descripcion": "Veredicto de calidad de los datos en un periodo: cuantos dias son utilizables, cuantos estan degradados y cuantos no tienen datos, mas los problemas mas frecuentes. Usala ANTES de reportar cualquier agregado del historico, y siempre que pregunten si los datos sirven o que tan confiable es un periodo. Omiti desde/hasta para todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          },
          "fuente": {
            "type": "string",
            "enum": [
              "radiacion_sc_15s",
              "monitoreo_sc_electrico"
            ],
            "description": "Acota el veredicto a una fuente. Omitir = las dos, y el dia se juzga por la peor. Las dos NO estan igual de sanas: conviene acotar."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "hallazgos_calidad",
      "familia": "calidad",
      "descripcion": "Detalle de los problemas de calidad detectados: que tipo, en que variable, que dia y cuantas lecturas afecta. Usala cuando pregunten QUE esta mal (no solo si los datos sirven), por un sensor concreto o por un problema concreto. Tipos posibles: dia_incompleto, hueco, duplicado_timestamp, cambio_de_cadencia, columna_ausente, nulos, fuera_de_rango, saturado_85, constante_en_cero, sensor_plano, offset_nocturno, kt_imposible.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          },
          "tipo": {
            "type": "string",
            "enum": [
              "dia_incompleto",
              "hueco",
              "duplicado_timestamp",
              "cambio_de_cadencia",
              "columna_ausente",
              "nulos",
              "fuera_de_rango",
              "saturado_85",
              "constante_en_cero",
              "sensor_plano",
              "offset_nocturno",
              "kt_imposible"
            ],
            "description": "Filtra por un tipo de problema."
          },
          "severidad": {
            "type": "string",
            "enum": [
              "grave",
              "aviso",
              "info"
            ],
            "description": "grave = el dato no sirve; aviso = usable con cuidado."
          },
          "variable": {
            "type": "string",
            "description": "Filtra por columna, p.ej. temp_vertical."
          },
          "limite": {
            "type": "integer",
            "minimum": 1,
            "maximum": 200,
            "default": 50
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "cielo_periodo",
      "familia": "calidad",
      "descripcion": "Como estuvo el cielo en un periodo: indice de cielo despejado (kt) medio, indice de variabilidad, reparto de dias entre despejado/parcial/cubierto/variable, y que fraccion de la irradiancia de cielo despejado se alcanzo. Usala para preguntas sobre nubes, dias soleados, o por que la generacion fue baja. Omiti desde/hasta para todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          },
          "detalle_diario": {
            "type": "boolean",
            "default": false,
            "description": "Devolver ademas un renglon por dia (max 400)."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    }
  ],
  "umbrales": [
    {
      "clave": "COBERTURA_MINIMA",
      "valor": 0.8,
      "que_decide": "debajo de esta fraccion de las horas de sol, el dia se marca incompleto"
    },
    {
      "clave": "DENSIDAD_MINIMA",
      "valor": 0.9,
      "que_decide": "faltan muestras dentro de la ventana que el logger si grabo"
    },
    {
      "clave": "FACTOR_HUECO",
      "valor": 3.0,
      "que_decide": "un salto de mas de N veces la cadencia del dia cuenta como hueco"
    },
    {
      "clave": "KT_DESPEJADO",
      "valor": 0.7,
      "que_decide": "indice de cielo despejado a partir del cual el momento es despejado"
    },
    {
      "clave": "KT_CUBIERTO",
      "valor": 0.35,
      "que_decide": "por debajo, cubierto"
    },
    {
      "clave": "KT_IMPOSIBLE",
      "valor": 1.2,
      "que_decide": "por encima es fisicamente imposible: dato invalido, no una nube"
    },
    {
      "clave": "VI_VARIABLE",
      "valor": 6.0,
      "que_decide": "indice de variabilidad para llamar variable al dia. CALIBRADO sobre esta serie, no tomado de la literatura"
    },
    {
      "clave": "FRACCION_MATERIAL",
      "valor": 0.2,
      "que_decide": "que fraccion de las lecturas tiene que tocar un hallazgo grave para que el dia deje de ser utilizable"
    }
  ],
  "hallazgos": {
    "tipos": [
      {
        "tipo": "dia_incompleto",
        "que_es": "el logger no grabo todas las horas de sol"
      },
      {
        "tipo": "hueco",
        "que_es": "faltan muestras dentro de la ventana que si grabo"
      },
      {
        "tipo": "duplicado_timestamp",
        "que_es": "el mismo instante aparece mas de una vez"
      },
      {
        "tipo": "cambio_de_cadencia",
        "que_es": "el intervalo de muestreo cambio respecto al dia anterior"
      },
      {
        "tipo": "columna_ausente",
        "que_es": "la columna no vino en el CSV de ese dia (variacion de esquema)"
      },
      {
        "tipo": "nulos",
        "que_es": "faltan valores sueltos en la columna"
      },
      {
        "tipo": "fuera_de_rango",
        "que_es": "valores fuera del rango fisico plausible"
      },
      {
        "tipo": "saturado_85",
        "que_es": "85 C constante: el DS18B20 esta desconectado"
      },
      {
        "tipo": "constante_en_cero",
        "que_es": "sin variacion en todo el dia; en lo electrico, no hubo generacion"
      },
      {
        "tipo": "sensor_plano",
        "que_es": "clavado en un valor que no es 0 ni 85: sensor trabado"
      },
      {
        "tipo": "offset_nocturno",
        "que_es": "el offset del piranometro sin calibrar (-38,845)"
      },
      {
        "tipo": "kt_imposible",
        "que_es": "mas energia que la de cielo despejado: dato invalido, no una nube"
      }
    ],
    "severidades": [
      "grave",
      "aviso",
      "info"
    ],
    "veredictos": [
      "ok",
      "aviso",
      "grave",
      "sin_datos"
    ]
  },
  "deteccion": {
    "modo": "barrido por lotes",
    "escribe": [
      "hallazgos_calidad",
      "cielo_diario",
      "ventana_solar"
    ],
    "por_que": "recorrer los dias es caro y el resultado no depende de quien pregunte: si la deteccion corriera dentro de una herramienta, cada pregunta la repetiria y dos personas podrian obtener veredictos distintos del mismo dia"
  },
  "garantias": [
    {
      "que": "las herramientas no pueden escribir en la base",
      "como": "su pool de conexiones es de SOLO LECTURA (historico.db), no un permiso que el prompt pueda pedir"
    },
    {
      "que": "no se reporta un agregado sin decir sobre cuantos dias utiles se calculo",
      "como": "el bloque `confianza` viaja DENTRO del payload de la herramienta, no en una instruccion del prompt"
    }
  ],
  "limites": {
    "historial_mensajes": 16,
    "max_tokens": 2048
  }
};

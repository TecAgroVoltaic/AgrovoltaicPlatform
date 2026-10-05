// Copia guardada del mapa del Agente Histórico. NO se edita a mano.
//
// Para qué: el servidor de datos se apaga fuera del horario laboral, y la
// arquitectura del agente no es un dato medido (no cambia con la hora, cambia con
// el código). Dejar la pantalla vacía a las 20:00 sería perder información que ya
// se tenía. La vista dibuja esta copia y lo dice con un cartel.
//
// Se genera del CÓDIGO del agente, no de lo que responde el servidor. Los dos
// pueden diferir (el contenedor desplegado suele ir detrás), y de las dos verdades
// esta es la útil: la copia solo se usa cuando el servicio no contesta, y entonces
// no hay nada con qué compararla. Además así el arnés puede exigir que TODA
// herramienta del código tenga su ficha en la consola, cosa que una captura del
// servidor viejo no permitía.
//
// Cómo se regenera, desde la raíz de agente-historico:
//
//   python -c "import sys,json; sys.path.insert(0,'src'); \
//     from historico.arquitectura import mapa; \
//     print(json.dumps(mapa(), ensure_ascii=False, indent=2))"
//
// Si queda vieja, la vista lo delata sola: compara el catálogo de prosa contra las
// herramientas del mapa y avisa de las diferencias en pantalla.
import type { MapaHistorico } from "./mapaHistorico";

export const RESPALDO_HISTORICO: MapaHistorico = {
  "agente": "historico",
  "nombre": "Histórico",
  "objetivo": "Responde qué pasó en el sistema PV de San Carlos, y si el dato en que se apoya la respuesta sirve.",
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
      "objetivo": "Qué pasó: energía generada, performance ratio, irradiancia, temperatura y tendencias sobre el histórico ya corregido."
    },
    "calidad": {
      "herramientas": [
        "calidad_periodo",
        "hallazgos_calidad",
        "cielo_periodo",
        "diagnostico_dia",
        "arquitectura_agente"
      ],
      "objetivo": "Si el dato sirve: completitud, validez, duplicados y cómo estuvo el cielo. Se responde LEYENDO el store de hallazgos, que escribe un barrido por lotes."
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
    },
    {
      "nombre": "diagnostico_dia",
      "familia": "calidad",
      "descripcion": "Todo lo que se sabe de UN dia concreto del historico: cuantas lecturas grabo cada fuente contra cuantas deberia haber grabado, el veredicto de calidad, la lista COMPLETA de hallazgos de ese dia con su significado, como estuvo el cielo, los dias vecinos y -si falta dato- de cuando a cuando va el hueco al que pertenece el dia y cual fue el ultimo dia con datos antes de el. Usala SIEMPRE que pregunten por un dia puntual: 'que paso el 2025-05-20', 'por que no hay datos ese dia', 'que problema tiene esa fecha'. Es la unica fuente para explicar un dia: lo que esta tool no dice, no se sabe.",
      "input_schema": {
        "type": "object",
        "properties": {
          "fecha": {
            "type": "string",
            "description": "El dia en ISO (YYYY-MM-DD), hora local de Costa Rica."
          }
        },
        "required": [
          "fecha"
        ],
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "arquitectura_agente",
      "familia": "calidad",
      "descripcion": "Como esta construido ESTE agente: que herramientas tiene y para que sirve cada una, las dos familias en que se dividen, los umbrales que deciden si un dato sirve (con que decide cada numero), los tipos de hallazgo que detecta, como corre la deteccion y que garantias da. Usala cuando pregunten por el agente en si: sus capacidades, sus limites, sus criterios, como funciona o por que decide lo que decide. NO la uses para datos del sistema fotovoltaico.",
      "input_schema": {
        "type": "object",
        "properties": {},
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
      "que_decide": "debajo de esta fracción de las horas de sol, el día se marca incompleto"
    },
    {
      "clave": "DENSIDAD_MINIMA",
      "valor": 0.9,
      "que_decide": "faltan muestras dentro de la ventana que el logger sí grabó"
    },
    {
      "clave": "FACTOR_HUECO",
      "valor": 3.0,
      "que_decide": "un salto de más de N veces la cadencia del día cuenta como hueco"
    },
    {
      "clave": "KT_DESPEJADO",
      "valor": 0.7,
      "que_decide": "índice de cielo despejado a partir del cual el momento es despejado"
    },
    {
      "clave": "KT_CUBIERTO",
      "valor": 0.35,
      "que_decide": "por debajo, cubierto"
    },
    {
      "clave": "KT_IMPOSIBLE",
      "valor": 1.2,
      "que_decide": "por encima es físicamente imposible: dato inválido, no una nube"
    },
    {
      "clave": "VI_VARIABLE",
      "valor": 6.0,
      "que_decide": "índice de variabilidad para llamar variable al día. CALIBRADO sobre esta serie, no tomado de la literatura"
    },
    {
      "clave": "FRACCION_MATERIAL",
      "valor": 0.2,
      "que_decide": "qué fracción de las lecturas tiene que tocar un hallazgo grave para que el día deje de ser utilizable"
    }
  ],
  "hallazgos": {
    "tipos": [
      {
        "tipo": "dia_incompleto",
        "que_es": "el logger no grabó todas las horas de sol"
      },
      {
        "tipo": "hueco",
        "que_es": "faltan muestras dentro de la ventana que sí grabó"
      },
      {
        "tipo": "duplicado_timestamp",
        "que_es": "el mismo instante aparece más de una vez"
      },
      {
        "tipo": "cambio_de_cadencia",
        "que_es": "el intervalo de muestreo cambió respecto al día anterior"
      },
      {
        "tipo": "columna_ausente",
        "que_es": "la columna no vino en el CSV de ese día (variación de esquema)"
      },
      {
        "tipo": "nulos",
        "que_es": "faltan valores sueltos en la columna"
      },
      {
        "tipo": "fuera_de_rango",
        "que_es": "valores fuera del rango físico plausible"
      },
      {
        "tipo": "saturado_85",
        "que_es": "85 °C constante: el DS18B20 está desconectado"
      },
      {
        "tipo": "constante_en_cero",
        "que_es": "sin variación en todo el día; en lo eléctrico, no hubo generación"
      },
      {
        "tipo": "sensor_plano",
        "que_es": "clavado en un valor que no es 0 ni 85: sensor trabado"
      },
      {
        "tipo": "offset_nocturno",
        "que_es": "el offset del piranómetro sin calibrar (-38,845)"
      },
      {
        "tipo": "kt_imposible",
        "que_es": "más energía que la de cielo despejado: dato inválido, no una nube"
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
    "por_que": "recorrer los días es caro y el resultado no depende de quién pregunte: si la detección corriera dentro de una herramienta, cada pregunta la repetiría y dos personas podrían obtener veredictos distintos del mismo día"
  },
  "garantias": [
    {
      "que": "las herramientas no pueden escribir en la base",
      "como": "su pool de conexiones es de SOLO LECTURA (historico.db), no un permiso que el prompt pueda pedir"
    },
    {
      "que": "no se reporta un agregado sin decir sobre cuántos días útiles se calculó",
      "como": "el bloque `confianza` viaja DENTRO del payload de la herramienta, no en una instrucción del prompt"
    }
  ],
  "limites": {
    "historial_mensajes": 16,
    "max_tokens": 2048
  }
};

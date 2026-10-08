// Los criterios del Histórico: umbrales, tipos de hallazgo, detección y garantías.
// Parte de la copia generada: ver `respaldoHistorico.ts`.
import type { MapaHistorico } from "../mapaHistorico";

export const CRITERIOS_HISTORICO: Pick<MapaHistorico, "umbrales" | "hallazgos" | "deteccion" | "garantias"> = {
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
};

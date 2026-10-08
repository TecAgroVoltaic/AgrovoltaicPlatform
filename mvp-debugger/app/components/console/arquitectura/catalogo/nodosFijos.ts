import { ANCHO, COL, type NodoFijo } from "./geometria";

// Todo lo que no es una herramienta: entra por posición fija porque su lugar en
// el relato no cambia (la pila de herramientas sí se calcula, ver Lienzo).
export const NODOS_FIJOS: NodoFijo[] = [
  {
    id: "e-consola", grupo: "entrada", x: COL.entrada, y: 70, w: ANCHO.entrada, h: 62,
    titulo: "Consola", sub: "Predicción vs Real · dos modos",
    ficha: {
      hover: "Manda una pregunta puntual sobre el momento que estás viendo, en el modo que elijas. Un solo turno, sin hilo.",
      hace: "La vista elige fecha, momento y anticipación, y dibuja lo medido contra el techo de cielo despejado. El botón manda la **pregunta** al agente, nunca los números. Pasárselos lo convertiría en un redactor de datos que no verificó.",
      puntos: [
        "Un turno por lectura: no reusa ni ensucia el hilo del chat flotante.",
        "La tarjeta compara después lo que recibió el agente contra lo que dibuja el gráfico; si no coincide, lo marca.",
      ],
      archivo: "app/components/console/LecturaAgente.tsx",
    },
  },
  {
    id: "e-chat", grupo: "entrada", x: COL.entrada, y: 150, w: ANCHO.entrada, h: 62,
    titulo: "Chat flotante", sub: "hilo multiturno con contexto",
    ficha: {
      hover: "Hilo multiturno. Manda el historial de texto limpio más el contexto de la vista activa.",
      hace: "Conversación libre con el agente. El historial viaja como texto plano (barato y sin malformar) y se recorta a los últimos mensajes.",
      puntos: [
        "El contexto de la vista se inyecta en el turno del usuario, no en el prompt de sistema.",
        "Si una herramienta devuelve un gráfico, se pinta inline; ese payload no va al modelo.",
      ],
      archivo: "app/components/chat/ChatWidget.tsx",
    },
  },
  {
    id: "e-flow", grupo: "entrada", x: COL.entrada, y: 230, w: ANCHO.entrada, h: 62,
    titulo: "VisioneFlow", sub: "nodo httpRequest → /chat",
    ficha: {
      hover: "El mismo endpoint cableado como nodo HTTP en VisioneFlow. Mismo agente, otra superficie.",
      hace: "Un flujo de tres nodos (disparador, `httpRequest` a `/forecast/chat`, salida) consume exactamente el mismo agente. No hay una segunda implementación.",
      puntos: [
        "La API key se pega en el nodo, como credencial del flujo.",
        "Sirve para demostrar que el agente no depende de la consola.",
      ],
      archivo: "agente-predictivo/flujo-chat-visioneflow.json",
    },
  },
  {
    id: "puerta", grupo: "puerta", x: COL.puerta, y: 150, w: ANCHO.puerta, h: 70,
    titulo: "Proxy Next", sub: "x-api-key · frenos",
    ficha: {
      hover: "El browser nunca habla con Python. La ruta del servidor inyecta la x-api-key; el servicio aplica el freno de ritmo y el presupuesto del día.",
      hace: "Todo pasa por rutas del lado servidor que reenvían al sidecar Python con la clave. Las claves viven solo en el servidor: el browser jamás las ve.",
      puntos: [
        "`x-api-key` obligatoria en producción, sobre HTTPS.",
        "Freno de ritmo por identidad, con token bucket. La identidad es la API key si viene; si no, la IP.",
        "Presupuesto diario duro: al pasarse responde 429 en vez de seguir gastando.",
        "Antes existía el medidor de gasto pero no el freno. Un bucle o un error de integración podían disparar la factura.",
      ],
      archivo: "app/api/predictivo/[...path]/route.ts",
    },
  },
  {
    id: "web_search", grupo: "servidor", x: COL.cerebro, y: 344, w: ANCHO.cerebro, h: 64,
    titulo: "web_search", sub: "la ejecuta Anthropic · nunca para pronosticar",
    ficha: {
      hover: "La ejecuta Anthropic del lado servidor, no nuestro código. Para conocimiento externo, nunca para conseguir un dato del sitio.",
      hace: "Es la única herramienta que sale de la casa, y la única que no corre en nuestro proceso. Sirve para conocimiento general (qué es el índice de cielo despejado, qué dice la literatura sobre un método), no para conseguir un número de San Carlos.",
      limites: [
        "Queda fuera del modo «medición oculta»: ahí no hay nada externo que consultar, y sí una tentación de buscar el dato.",
        "Los pasos de búsqueda quedan en la traza como `tipo: web`.",
      ],
      archivo: "src/predictivo/agent/agent.py · WEB_SEARCH",
    },
  },
  {
    id: "agrodash", grupo: "dato", x: COL.dato, y: 474, w: ANCHO.dato, h: 64,
    titulo: "AgroDash · réplica", sub: "PostgreSQL de Cartago (RO) → ETL → store",
    ficha: {
      hover: "La base PostgreSQL de la región Cartago, restaurada como réplica. El ETL copia de ahí lo que el pronóstico necesita.",
      hace: "Los sensores ambientales de ambos sitios viven en AgroDash; los de San Carlos son las cajas con sufijo `SC`. El ETL lee de ahí y escribe en el store propio: separar «de dónde traigo» de «dónde guardo» evita mezclarlos.",
      puntos: [
        "Canal de irradiancia fijado por identificador, para que la elección sea reproducible y no dependa del orden de las filas.",
        "Cambiar de sitio (San Carlos a Cartago) es cuestión de variables de entorno, no de código.",
      ],
      archivo: "src/predictivo/etl.py",
    },
  },
];

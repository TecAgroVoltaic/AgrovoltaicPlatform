// Geometría del lienzo del Agente Histórico y sus nodos fijos (entradas y
// puerta).
import type { Ficha } from "../catalogo";

// ── Geometría del lienzo ────────────────────────────────────────────────────
// Mismas columnas y proporciones que el mapa del Predictivo, a propósito: son dos
// agentes del mismo sistema y cambiar el lenguaje visual entre uno y otro obliga a
// releer la pantalla desde cero. Lo que cambia es el RELATO, no el vocabulario.
//
// Lo único que se posiciona a mano es lo que no varía nunca. La pila de
// herramientas se calcula desde lo que publica el servicio (ver LienzoHistorico),
// así que si mañana hay trece, entra sola y el lienzo crece.
export const LIENZO_H = { w: 1140, margenInferior: 34 };
export const COL_H = { entrada: 16, puerta: 216, cerebro: 332, tool: 620, dato: 908 };
export const ANCHO_H = { entrada: 172, puerta: 88, cerebro: 240, tool: 248, dato: 216 };
// Alto y separación de la pila. El alto da para dos renglones MÁS la marca de
// `confianza`, que va en la fila del título y no debajo: apretados, el chip se
// comía el borde del nodo siguiente.
export const TOOL_H = { h: 58, gap: 14, y0: 76, entreGrupos: 62, encabezado: 22 };

export type NodoFijoH = {
  id: string; grupo: "entrada" | "puerta";
  x: number; y: number; w: number; h: number;
  titulo: string; sub: string; ficha: Ficha;
};

export const NODOS_FIJOS_H: NodoFijoH[] = [
  {
    id: "h-consola", grupo: "entrada", x: COL_H.entrada, y: 76, w: ANCHO_H.entrada, h: 60,
    titulo: "Consola", sub: "Calidad de datos · mapa de días",
    ficha: {
      hover: "Las vistas de calidad leen el store directamente por HTTP, sin pasar por el modelo.",
      hace: "«Calidad de datos» pide tres lecturas del store (`/calidad/resumen`, `/calidad/dias`, `/calidad/hallazgos`) y las dibuja. No hay LLM en ese camino y por eso no cuesta un centavo.",
      ayuda: "Que la vista NO pase por el agente es lo que la hace comparable con el reporte del CLI: los dos leen la misma tabla con el mismo criterio. Si la consola calculara el veredicto por su cuenta, podría discrepar del agente sobre si un día sirve, y eso no se nota hasta que alguien ya decidió algo con él.",
      archivo: "app/components/console/CalidadView.tsx",
    },
  },
  {
    id: "h-chat", grupo: "entrada", x: COL_H.entrada, y: 150, w: ANCHO_H.entrada, h: 60,
    titulo: "Chat flotante", sub: "hilo multiturno + contexto de la vista",
    ficha: {
      hover: "Hilo multiturno. Manda el historial de texto limpio más el contexto de la vista activa.",
      hace: "Conversación libre. El historial viaja como texto plano (barato y sin poder malformarse) y se recorta a los últimos mensajes.",
      puntos: [
        "El contexto de la vista se inyecta en el turno del usuario, **fuera** de la parte cacheada del prompt: cambiar de filtro no invalida la caché.",
        "Si una herramienta devuelve un gráfico, se pinta inline; ese payload no va al modelo.",
      ],
      archivo: "app/components/chat/ChatWidget.tsx",
    },
  },
  {
    id: "h-flow", grupo: "entrada", x: COL_H.entrada, y: 224, w: ANCHO_H.entrada, h: 60,
    titulo: "VisioneFlow", sub: "un httpRequestTool por herramienta",
    ficha: {
      hover: "El orquestador externo cablea cada herramienta como un nodo HTTP y pone su propio LLM.",
      hace: "VisioneFlow no usa el agente: usa sus **herramientas**. Cada una se cablea como una instancia del nodo genérico `httpRequestTool` contra `POST /tool/<nombre>`, y el modelo lo pone el canvas.",
      ayuda: "Es la prueba de que el reparto «cerebro vs manos» es real y no una figura retórica: los números salen igual con otro cerebro encima, porque el cálculo nunca estuvo en el modelo.",
      archivo: "src/historico/api.py",
    },
  },
  {
    id: "h-puerta", grupo: "puerta", x: COL_H.puerta, y: 150, w: ANCHO_H.puerta, h: 64,
    titulo: "x-api-key", sub: "salvo /health y /arquitectura",
    ficha: {
      hover: "Comparación en tiempo constante. Sin la clave configurada, la verificación se desactiva: la ausencia no falla, abre.",
      hace: "Exige el header `x-api-key` en todo lo que toca datos. La comparación es en tiempo constante (`secrets.compare_digest`).",
      limites: [
        "`/health`, `/tools` y `/arquitectura` quedan **abiertos a propósito**: describen al agente, no sus datos, y la consola dibuja el mapa sin credencial.",
        "Si la variable de entorno no está, la verificación **se desactiva** en vez de fallar. Un renombre sin respaldo no tumba el servicio: lo deja abierto.",
      ],
      archivo: "src/historico/api.py",
    },
  },
];

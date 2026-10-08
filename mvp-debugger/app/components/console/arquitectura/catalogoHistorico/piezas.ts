// Las piezas del relato del Agente Histórico que no son herramientas: qué
// aporta cada familia, el modelo, a dónde lee cada familia y el barrido.
import type { Ficha } from "../catalogo";

import { ANCHO_H, COL_H } from "./lienzo";

/** Qué aporta cada familia, dicho para un lector y no para el modelo. */
export const FAMILIAS: Record<string, { titulo: string; nota: string }> = {
  analisis: {
    titulo: "Análisis",
    nota: "Qué pasó. Trabajan sobre las vistas corregidas, no sobre el crudo.",
  },
  calidad: {
    titulo: "Calidad",
    nota: "Si el dato sirve. No calculan: LEEN el store que dejó el barrido.",
  },
};

/** El modelo. Su contenido sale del mapa; acá solo vive el «por qué». */
export const CEREBRO_H = {
  x: COL_H.cerebro, y: 60, w: ANCHO_H.cerebro, h: 250,
  ficha: {
    hover: "El lazo tool-use manual. El modelo elige qué herramienta llamar; el lazo la ejecuta y le devuelve el JSON crudo; el modelo redacta.",
    hace: "Orquesta y nada más. **No sabe SQL ni física**: manda la pregunta al modelo con el juego de herramientas, ejecuta la que pida, le devuelve la salida cruda y repite hasta que cierra el turno.",
    ayuda: "Es genérico sobre el registro de herramientas: no hay lógica de ninguna de ellas acá. Agregar una es crear su archivo e importarlo, sin tocar el lazo.",
    puntos: [
      "Patrón manual y no el *tool-runner* beta: control del ciclo y sin filtrar el razonamiento interno.",
      "Cada turno devuelve la **traza**: pasos del modelo, cada herramienta con entrada y salida cruda, tokens, milisegundos y US$.",
      "El modelo es liviano a propósito. Solo orquesta; subir de gama es una variable de entorno.",
    ],
    archivo: "src/historico/agent/agent.py",
  } as Ficha,
};

/** A dónde va a leer cada familia. Es la mitad del relato de este agente. */
export const DESTINO: Record<string, { titulo: string; sub: string; filas: string[]; ficha: Ficha }> = {
  analisis: {
    titulo: "Vistas corregidas",
    sub: "el crudo sigue crudo; la corrección vive en vistas",
    filas: ["v_sc_electrico_corregido", "v_sc_radiacion_calibrada", "v_sc_performance"],
    ficha: {
      hover: "Las herramientas de análisis nunca leen la tabla cruda: leen las vistas donde ya se aplicaron las correcciones.",
      hace: "Vistas de PostgreSQL sobre las tablas base. Ahí es donde los 85 °C pasan a NULL, la irradiancia negativa queda en cero y la potencia se recorta a un rango físico.",
      ayuda: "Es la regla rectora del proyecto, validada con Leo Cardinale: **se guarda el crudo y se corrige en una capa de análisis**. Corregir al insertar destruye la evidencia y hace irrepetible cualquier revisión del criterio; corregir en una vista deja las dos versiones disponibles y permite cambiar de opinión sin re-cargar 285 CSV.",
      archivo: "docs/memoria/decisiones/respuestas-leo-cardinale.md",
    },
  },
  calidad: {
    titulo: "Store de hallazgos",
    sub: "un renglón por (día, fuente, variable, tipo)",
    filas: ["hallazgos_calidad", "cielo_diario", "ventana_solar"],
    ficha: {
      hover: "Las herramientas de calidad no detectan nada: leen lo que el barrido ya dejó escrito.",
      hace: "Tres tablas. `hallazgos_calidad` con PK `(fecha, fuente, variable, tipo)`, así que re-correr el barrido actualiza en vez de duplicar; `cielo_diario` con la caracterización del cielo; `ventana_solar` con el amanecer y el atardecer de cada día.",
      ayuda: "`ventana_solar` es una tabla y no un cálculo al vuelo por un motivo que decide todo lo demás: el logger **solo graba de día**, así que «el día está completo» no se mide contra 24 h sino contra las horas de sol de ese día. Y sin una tabla con TODOS los días del calendario, los días sin ninguna fila serían invisibles, que es justo el hallazgo más grande del histórico.",
      archivo: "sql/001_calidad_y_cielo.sql",
    },
  },
};

/** El barrido: la pieza que hace que el agente no tenga que detectar nada. */
export const BARRIDO = {
  titulo: "Barrido por lotes",
  sub: "determinista · sin LLM · escribe el store",
  ficha: {
    hover: "Recorre el histórico día por día y tipifica lo que encuentra. Corre por cron, fuera de cualquier pregunta.",
    hace: "Recorre día por día las dos fuentes, aplica los umbrales y escribe un renglón por cada `(día, fuente, variable, tipo)` que encuentra. Es el único que usa el pool de escritura.",
    ayuda: "Que corra **antes** y no dentro de una pregunta es lo que hace reproducible el veredicto. Si la detección viviera en una herramienta, cada pregunta la repetiría (caro) y dos personas podrían obtener veredictos distintos del mismo día (peor). Acá el resultado está escrito: la misma pregunta da la misma respuesta.",
    archivo: "src/historico/calidad/barrido.py",
  } as Ficha,
};

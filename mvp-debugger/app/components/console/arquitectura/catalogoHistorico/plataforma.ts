// Fichas de las herramientas de PLATAFORMA del Agente Histórico: qué datos hay,
// de dónde sale cada uno, archivos a medida, dónde está cada cosa en la consola y
// qué dice la documentación. Van en la familia ANÁLISIS del servicio, pero viven
// aparte porque no analizan: responden «qué hay y dónde».
import type { Ficha } from "../catalogo";

export const HERRAMIENTAS_PLATAFORMA: Record<string, Ficha> = {
  catalogo_datos: {
    resumen: "qué datos hay, con nombre legible",
    hover: "El catálogo unificado de las cuatro fuentes, agrupado por fuente y tema, para marcar variables en el chat.",
    hace: "Devuelve las variables disponibles con id `<fuente>:<clave>`, etiqueta, unidad y cobertura; la interfaz las muestra como un selector.",
    ayuda: "Quien analiza no conoce los nombres de las columnas. Esta herramienta hace que **nunca tenga que conocerlos**: marca lo que quiere y el pedido llega con los ids exactos.",
    archivo: "tools/catalogo_datos.py",
  },
  origen_dato: {
    resumen: "de qué fuente sale una variable",
    hover: "Fuente, tabla o tipo de sensor, cadencia y cobertura de una variable del catálogo.",
    hace: "Resuelve un id del catálogo unificado a su fuente (Supabase PV, store ambiental, AgroDash SC o Cartago) y dice cómo se mide.",
    ayuda: "San Carlos y Cartago son regiones distintas y no se mezclan sin decirlo: esta herramienta es la que deja **explícito de dónde viene cada número**.",
    archivo: "tools/origen_dato.py",
  },
  plan_exportacion: {
    resumen: "archivos combinados o separados",
    hover: "Uno o varios archivos con las variables pedidas, remuestreadas a un intervalo común, en csv, dat, mat o zip.",
    hace: "Valida el plan, estima filas y devuelve las descargas. El archivo se genera recién cuando la persona aprieta el botón.",
    ayuda: "Cruzar fuentes con cadencias distintas (15 s, 5 min, buckets de AgroDash) exige una **rejilla común**: sin intervalo no hay columnas alineadas, por eso el agente siempre lo pregunta y propone uno.",
    limites: [
      "Más de 100.000 filas pide confirmación; más de 2.000.000 no se genera.",
      "Las celdas sin dato quedan vacías: nunca se rellenan.",
    ],
    archivo: "tools/plan_exportacion.py",
  },
  navegar_consola: {
    resumen: "dónde está cada cosa",
    hover: "Elige la sección de la consola que muestra lo pedido y arma el enlace con sus filtros.",
    hace: "Busca en el catálogo de secciones (`secciones.json`) y devuelve un botón «Ir» con solo los parámetros que esa sección acepta.",
    ayuda: "Lee el **mismo catálogo** que la barra lateral, así que no puede mandar a una sección que no existe.",
    archivo: "tools/navegar_consola.py",
  },
  buscar_documentacion: {
    resumen: "qué dice la documentación del proyecto",
    hover: "Búsqueda léxica en la memoria del proyecto, la referencia y los conceptos.",
    hace: "Devuelve extractos cortos con su documento y sección; la interfaz muestra las referencias.",
    ayuda: "Las decisiones del equipo (cómo se calcula el PR, qué es el código 302) viven en `docs/`: responder desde ahí evita que el modelo **conteste de memoria**.",
    archivo: "tools/buscar_documentacion.py",
  },
};

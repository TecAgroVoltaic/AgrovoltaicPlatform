// Catálogo de la vista «Los datos»: la PROSA y la GEOMETRÍA del recorrido ETL.
//
// Diferencia importante con `arquitectura/catalogo.ts`: aquella vista se dibuja
// con lo que el servicio publica en vivo, así que no puede mentir. Esta NO tiene
// esa red. El servicio del pronóstico solo lee `lecturas_ambientales_sc`; las
// tablas fotovoltaicas (`monitoreo_sc_electrico`, `radiacion_sc_15s`) no pasan
// por él, así que ningún endpoint puede reportar estas cifras.
//
// La consecuencia se asume de frente en vez de disimularse: los números son un
// CORTE FECHADO, la fecha está a la vista en la pantalla (ver `CORRIDA`), y quien
// los lea sabe que está viendo una foto y no un termómetro. Un número sin fecha
// habría envejecido en silencio, que es exactamente lo que esta consola no puede
// permitirse.
//
// Verificados con SELECT contra la base viva el 2026-08-20.
import type { Ficha } from "@/app/components/console/arquitectura/catalogo";

/** Cuándo se corrió el ETL y cuándo se verificaron estas cifras contra la base. */
export const CORRIDA = { ejecutado: "2026-08-10", verificado: "2026-08-20" };

// ── El recorrido, en cinco actos ───────────────────────────────────────────
//
// La primera versión de este lienzo dibujaba `extract → transform → load`. Eran
// los nombres de los MÓDULOS, y a alguien que no escribió el pipeline no le
// dicen nada: se veía un diagrama genérico que podría ser el de cualquier ETL
// del mundo.
//
// Este muestra el DATO, no el código. Cada acto lleva una muestra de cómo se ve
// el dato en ese punto (con valores reales, los mismos que están en la base), el
// gesto que se le aplica y por qué. Alguien que no sepa nada del proyecto
// debería poder leer el orden, entender qué pasó en cada paso y, sobre todo, ver
// la línea que parte el recorrido en dos: lo que se decide AL CARGAR es
// irreversible, lo que se decide AL CONSULTAR se reescribe. Esa línea es la
// decisión de diseño que ordena el modelo entero, así que se dibuja.
export const LIENZO_D = { w: 1140, alto: 320 };
/** Ancho de cada acto y posición de la línea que parte el recorrido. */
export const ACTO = { w: 200, h: 240, y: 52, divisor: 679 };

/** La muestra del dato: qué se dibuja adentro de cada acto. */
export type Muestra =
  /** El mismo concepto escrito de tres formas, una por archivo. */
  | { tipo: "archivos"; filas: [string, string][] }
  /** Varias formas que colapsan a una. */
  | { tipo: "convergencia"; desde: string[]; hasta: string }
  /** Filas de valores, con su estado. `encabezado` describe de dónde salen. */
  | { tipo: "valores"; encabezado?: string; filas: [string, string][];
      estado: "crudo" | "corregido" };

export type Acto = {
  n: number;
  id: string;
  /** De qué lado de la línea cae. Es lo más importante del dibujo. */
  zona: "cargar" | "consultar";
  x: number;
  /** Qué pasa acá, en dos o tres palabras. */
  titulo: string;
  /** El detalle operativo del paso, en una línea corta. */
  gesto: string;
  muestra: Muestra;
  /** Por qué se hace así y no de otra forma. Una frase. */
  porque: string;
  ficha: Ficha;
};

export const ACTOS: Acto[] = [
  {
    n: 1, id: "llega", zona: "cargar", x: 20,
    titulo: "Llega el crudo",
    gesto: "285 archivos · 13 esquemas",
    muestra: {
      tipo: "archivos",
      filas: [
        ["dic-2024", "vpv1"],
        ["may-2025", "Voltaje PV1 [V]"],
        ["jun-2026", "voltaje_pv1_v"],
      ],
    },
    porque: "Nadie fijó un estándar: cada versión del datalogger escribió distinto.",
    ficha: {
      hover: "19 meses de descargas, un archivo por día, con 13 esquemas distintos y la misma variable escrita de tres formas.",
      hace: "19 meses de descargas del sitio, un archivo por día, como los dejó cada versión del datalogger.",
      ayuda: "Es el punto de partida: **no hay un estándar de datos**. Sin ver esto, los once tratamientos de abajo parecen burocracia.",
      puntos: [
        "**13 esquemas**: las columnas aparecen, desaparecen y cambian de nombre entre archivos.",
        "**Typos en el header**: `Energì` en 72 archivos, `POTencia` en 2, `Corriente PV2[A]` en 5.",
        "**Dos huecos largos**: 126 y 71 días sin dato.",
      ],
      archivo: "dataset/Monitoreo-AgroVoltaic-SC-NEW/",
    },
  },
  {
    n: 2, id: "unifica", zona: "cargar", x: 238,
    titulo: "Se unifica el nombre",
    gesto: "~70 variantes → 1 por concepto",
    muestra: {
      tipo: "convergencia",
      desde: ["vpv1", "Voltaje PV1 [V]", "voltaje_pv1_v"],
      hasta: "voltaje_pv1_v",
    },
    porque: "Se colapsan solas quitando acentos, unidades y mayúsculas. Sin lista que mantener.",
    ficha: {
      hover: "slugify() quita acentos, unidades y mayúsculas, así que las ~70 formas de escribir lo mismo caen solas en un nombre canónico.",
      hace: "Lee el CSV aunque traiga filas rotas, normaliza cada encabezado y tipa los valores.",
      ayuda: "Es lo que evita reescribir el pipeline cada vez que cambia el datalogger: `Energìa [Wh]`, `energia_hoy_wh` y `Energía Hoy` caen solas en el mismo lugar, sin enumerarlas.",
      puntos: [
        "**Cero columnas quemadas.** De `CONCEPT_MAP` se derivan las columnas, las etiquetas, el resampleo y el DDL.",
        "Columna nueva = una línea. Ortografía nueva del mismo concepto = nada.",
      ],
      archivo: "src/agrovoltaic/extract.py · normalize.py",
    },
  },
  {
    n: 3, id: "guarda", zona: "cargar", x: 456,
    titulo: "Se guarda tal cual",
    gesto: "2 tablas · eléctrico 5 min · radiación 15 s",
    muestra: {
      tipo: "valores", estado: "crudo",
      encabezado: "lo imposible entra igual",
      filas: [
        ["temp_inclinado", "85,0 °C"],
        ["potencia_pv1_w", "26.503.163 W"],
        ["irradiancia", "−15.538"],
      ],
    },
    porque: "Una corrección es una hipótesis, y las hipótesis cambian. El crudo no se reconstruye.",
    ficha: {
      hover: "El valor del sensor entra exactamente como llegó, valores imposibles incluidos. Es la decisión que ordena todo el modelo.",
      hace: "Guardan el valor **exactamente como llegó**, valores imposibles incluidos: el 85 °C, el pico de 26,5 MW y la irradiancia negativa están ahí adentro.",
      ayuda: "Guardar la basura a propósito es contraintuitivo, y es la decisión más importante del modelo. Si el 85 °C se hubiera vuelto NULL al cargar, hoy no habría cómo contar cuántas veces falló el sensor. El crudo no se reconstruye; una vista se reescribe en una tarde.",
      puntos: [
        "`monitoreo_sc_electrico` (5 min) y `radiacion_sc_15s` (15 s), cada una con PK `timestamp`.",
        "Antes de guardar se separa por sensor: el inversor y el piranómetro venían mezclados en el mismo archivo.",
        "**RLS sin políticas** en las 9 tablas: solo entran los roles de servicio.",
      ],
      archivo: "src/agrovoltaic/transform.py · load.py · sql/schema.sql",
    },
  },
  {
    n: 4, id: "corrige", zona: "consultar", x: 702,
    titulo: "Se corrige al leer",
    gesto: "vistas SQL sobre el crudo",
    muestra: {
      tipo: "valores", estado: "corregido",
      encabezado: "las mismas tres filas",
      filas: [
        ["temp_inclinado", "NULL"],
        ["potencia_pv1_w", "NULL"],
        ["irradiancia", "0"],
      ],
    },
    porque: "Cambiar un umbral es reescribir una vista, no recargar 130.000 filas.",
    ficha: {
      hover: "Rangos físicos, el 85 °C y el offset se resuelven en SQL, al consultar, sin tocar el crudo.",
      hace: "Aplican en SQL, sobre el crudo y sin tocarlo, los tratamientos 4 a 8: temperatura fuera de 10 a 80 °C, potencia fuera de 0 a 5.000 W, el offset −38,845 y los negativos.",
      ayuda: "La otra mitad de la regla: el crudo queda intacto **y aun así se consulta dato limpio**. Y como cada corrección es una columna con nombre propio, el valor corregido se puede comparar contra el original en la misma consulta.",
      puntos: [
        "`v_sc_electrico_corregido`: temperatura, potencia, voltaje, corriente y frecuencia.",
        "`v_sc_radiacion_corregida`: offset y negativos a 0; la irradiancia anterior a jul-2025 se marca no válida.",
        "Con `security_invoker = on`: la vista no elude los permisos de quien consulta.",
      ],
      archivo: "sql/schema.sql · src/agrovoltaic/ddl.py",
    },
  },
  {
    n: 5, id: "calibra", zona: "consultar", x: 920,
    titulo: "Se calibra y se evalúa",
    gesto: "W/m² · kt* · Performance Ratio",
    muestra: {
      tipo: "valores", estado: "corregido",
      encabezado: "recién acá significa algo",
      filas: [
        ["irradiancia", "734 W/m²"],
        ["kt* (claridad)", "0,61"],
        ["PR del arreglo", "0,621"],
      ],
    },
    porque: "No hay constante de fábrica: se calibra contra el cielo despejado modelado.",
    ficha: {
      hover: "La irradiancia pasa a W/m² contra el cielo despejado de pvlib, y de ahí salen kt* y el Performance Ratio por arreglo.",
      hace: "Convierten la irradiancia a W/m² contra el techo de cielo despejado (pvlib), derivan la fracción de claridad kt\\* y el Performance Ratio de cada arreglo.",
      ayuda: "Es lo que convierte un número sin unidad en una medición. Sin esto no había forma de saber si una lectura era plausible, ni de calcular rendimiento: la geometría del sistema estuvo bloqueada hasta que Leo la confirmó.",
      puntos: [
        "`v_sc_radiacion_calibrada`: W/m², kt\\* y bandera de calidad. **99,0 %** pasa QC, kt\\* p95 = 1,00.",
        "`v_sc_performance`: **PV1 = 0,621 · PV2 = 0,626**. Convergen, y eso valida el modelo bifacial.",
        "«Celda calibrada» es el nombre comercial del sensor, no quiere decir que el dato venga escalado (Leo P11).",
      ],
      archivo: "src/agrovoltaic/clearsky.py · performance.py",
    },
  },
];

/** Las dos zonas, con el rótulo que explica por qué la línea está ahí. */
export const ZONAS = [
  {
    id: "cargar" as const, x: 20, w: 636,
    titulo: "Al cargar · una sola vez",
    nota: "Irreversible: por eso acá hay lo mínimo.",
  },
  {
    id: "consultar" as const, x: 702, w: 418,
    titulo: "Al consultar · cada vez",
    nota: "Reversible: acá vive toda la corrección.",
  },
];

// ── Qué se le hizo a los datos ─────────────────────────────────────────────
/**
 * Un tratamiento por línea, en el orden en que se aplican.
 *
 * Sigue el documento que revisó Leo Cardinale (P1 a P12, doc rev LCV del
 * 2026-08-10): cada punto es la respuesta a una de esas preguntas, o el paso del
 * pipeline que la implementa. `leo` cita cuál, para que se pueda contrastar.
 *
 * `donde` importa más de lo que parece: separa lo que se decide al CARGAR (y por
 * lo tanto es irreversible) de lo que se decide al CONSULTAR (y se puede
 * reescribir). Casi todo vive en la segunda, y esa es la regla rectora.
 */
export type Tratamiento = {
  n: number;
  titulo: string;
  /** Una frase. Problema y solución en la misma línea. */
  que: string;
  donde: "etl" | "vista";
  leo?: string;
  /** Marca lo que todavía no está cerrado. */
  parcial?: boolean;
};

export const TRATAMIENTOS: Tratamiento[] = [
  {
    n: 1, titulo: "Normalización de nombres", donde: "etl", leo: "P1",
    que: "13 esquemas y unas 70 formas de escribir lo mismo (`vpv1`, `Voltaje PV1 [V]`, `voltaje_pv1_v`). `slugify()` las colapsa solas a un nombre canónico por concepto.",
  },
  {
    n: 2, titulo: "Separación por fuente física", donde: "etl", leo: "P8",
    que: "El inversor y el piranómetro venían en el mismo archivo. Se parten en dos tablas, una por fuente.",
  },
  {
    n: 3, titulo: "Ritmo de muestreo", donde: "etl", leo: "P8",
    que: "Venía variable (2 s, 1 min, 5 min). Eléctrico a **5 min**; radiación a **15 s** en tabla aparte, porque ThingSpeak no admite menos.",
  },
  {
    n: 4, titulo: "El crudo no se toca", donde: "vista", leo: "P2 · P5 · P9",
    que: "**La regla que ordena todo.** Nada se anula al cargar: cada corrección es una columna nueva calculada en una vista SQL sobre el dato original.",
  },
  {
    n: 5, titulo: "Temperaturas en 85 °C", donde: "vista", leo: "P2 · P3 · P9",
    que: "85,0 es el código de error del DS18B20 con falso contacto, no una lectura. Se anula, junto con todo lo que caiga fuera de **10 a 80 °C**.",
  },
  {
    n: 6, titulo: "Offset −38,845 y negativos", donde: "vista", leo: "P4 · P5",
    que: "Es calibración y ruido eléctrico, esperable en estos equipos. Se llevan a 0 en la capa; el crudo queda por si sirve después.",
  },
  {
    n: 7, titulo: "Rangos físicos por variable", donde: "vista", leo: "P9 · P10",
    que: "Potencia 0 a 5.000 W, voltaje de string 0 a 600 V, corriente 0 a 20 A, frecuencia 55 a 65 Hz. Fuera de rango va a NULL: el crudo llega a marcar **26,5 MW** en un arreglo de 1.420 Wp.",
  },
  {
    n: 8, titulo: "Irradiancia anterior a jul-2025", donde: "vista", leo: "P12",
    que: "El error de medición se corrigió a mediados de 2025. Esas lecturas se marcan **no válidas** en vez de borrarse.",
  },
  {
    n: 9, titulo: "Calibración de la irradiancia", donde: "vista", leo: "P11",
    que: "No hay constante guardada: «celda calibrada» es el nombre comercial del sensor. Se calibra contra el cielo despejado de pvlib.",
  },
  {
    n: 10, titulo: "Filas de dos sensores mezcladas", donde: "etl", leo: "P6 · P7", parcial: true,
    que: "8 archivos donde la irradiancia cae en la columna «Voltaje PV1». Hoy se conserva lo que coincide con el header y se acepta el hueco; falta el remapeo fino.",
  },
  {
    n: 11, titulo: "Duplicados y huecos", donde: "etl",
    que: "Los archivos repetidos se saltan por md5. Los huecos de 126 y 71 días **no** se rellenan con datos sintéticos.",
  },
];

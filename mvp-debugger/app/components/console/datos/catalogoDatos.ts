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

// ── Geometría del lienzo ───────────────────────────────────────────────────
// Cinco columnas, una por etapa. El recorrido se lee de izquierda a derecha,
// que es como se lee un pipeline.
export const LIENZO_D = { w: 1140, margenInferior: 30 };
export const COL_D = { csv: 16, extract: 245, transform: 460, load: 675, tabla: 890 };
export const ANCHO_D = { csv: 200, etapa: 186, tabla: 234 };

export type GrupoDato = "fuente" | "etapa" | "tabla" | "vista";

export type NodoDato = {
  id: string;
  grupo: GrupoDato;
  x: number; y: number; w: number; h: number;
  titulo: string;
  sub: string;
  ficha: Ficha;
};

export const NODOS_DATOS: NodoDato[] = [
  // ── La fuente ────────────────────────────────────────────────────────────
  {
    id: "csv", grupo: "fuente", x: COL_D.csv, y: 76, w: ANCHO_D.csv, h: 74,
    titulo: "285 archivos CSV",
    sub: "13 esquemas · nov-2024 a jun-2026",
    ficha: {
      hover: "Los datos crudos tal como los deja el datalogger: 285 CSV con 13 esquemas distintos y siete clases de problemas.",
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

  // ── Extract ──────────────────────────────────────────────────────────────
  {
    id: "extract", grupo: "etapa", x: COL_D.extract, y: 76, w: ANCHO_D.etapa, h: 74,
    titulo: "extract",
    sub: "colapsa ~70 nombres a uno",
    ficha: {
      hover: "Lee cada CSV tolerando filas rotas y normaliza los nombres de columna: ~70 variantes crudas colapsan a un nombre canónico por concepto.",
      hace: "Lee el CSV aunque traiga filas rotas, normaliza cada encabezado y tipa los valores.",
      ayuda: "Es lo que evita reescribir el pipeline cada vez que cambia el datalogger: `slugify()` quita acentos, unidades y mayúsculas, así que `Energìa [Wh]`, `energia_hoy_wh` y `Energía Hoy` caen solas en el mismo lugar, sin enumerarlas.",
      puntos: [
        "**Cero columnas quemadas.** De `CONCEPT_MAP` se derivan las columnas, las etiquetas, el resampleo y el DDL.",
        "Columna nueva = una línea. Ortografía nueva del mismo concepto = nada.",
      ],
      archivo: "src/agrovoltaic/extract.py · normalize.py",
    },
  },

  // ── Transform ────────────────────────────────────────────────────────────
  {
    id: "transform", grupo: "etapa", x: COL_D.transform, y: 76, w: ANCHO_D.etapa, h: 74,
    titulo: "transform",
    sub: "parte en dos · 5 min y 15 s",
    ficha: {
      hover: "Separa cada archivo en dos flujos por fuente física y los lleva a su cadencia oficial. NO limpia nada: el crudo se conserva.",
      hace: "Separa cada archivo en dos flujos según de qué sensor viene cada columna, y los lleva a su cadencia: 5 min el eléctrico, 15 s la radiación.",
      ayuda: "Antes todo iba a una tabla ancha y la radiación quedaba diluida en el ritmo del inversor. Y lo que **no** hace pesa igual: no anula ni recorta nada, el crudo pasa tal cual.",
      puntos: [
        "**15 s y no 10**: ThingSpeak no admite menos. Lo de menos de 10 s eran pruebas.",
        "Promedia las tasas pero toma el **último** valor de los acumuladores: promediar energía acumulada no significa nada.",
      ],
      archivo: "src/agrovoltaic/transform.py",
    },
  },

  // ── Load ─────────────────────────────────────────────────────────────────
  {
    id: "load", grupo: "etapa", x: COL_D.load, y: 76, w: ANCHO_D.etapa, h: 74,
    titulo: "load",
    sub: "UPSERT por timestamp",
    ficha: {
      hover: "Inserta con ON CONFLICT DO UPDATE sobre la PK timestamp, y salta los CSV cuyo md5 no cambió. Reprocesar nunca duplica.",
      hace: "Inserta con `ON CONFLICT DO UPDATE` sobre la PK `timestamp`, y salta los archivos cuyo md5 no cambió.",
      ayuda: "Es lo que hace de esto un **proceso permanente y no un script de una sola vez**: correrlo dos veces da lo mismo que correrlo una. Agregar datos es soltar el CSV y volver a correr.",
      puntos: [
        "Idempotente por **archivo** (md5 en `_ingest_log`) y por **fila** (PK `timestamp`).",
        "Un archivo malo se loguea y **no frena el resto**.",
      ],
      archivo: "src/agrovoltaic/load.py · state.py",
    },
  },

  // ── Tablas crudas ────────────────────────────────────────────────────────
  {
    id: "crudo", grupo: "tabla", x: COL_D.tabla, y: 62, w: ANCHO_D.tabla, h: 100,
    titulo: "2 tablas crudas",
    sub: "36.469 eléctricas · 94.868 radiación",
    ficha: {
      hover: "El dato del sensor tal cual, sin una sola corrección. Es la regla rectora del modelo: lo que se guarda es lo que midió el aparato.",
      hace: "Guardan el valor **exactamente como llegó**, valores imposibles incluidos: el 85 °C, el pico de 26,5 MW y la irradiancia negativa están ahí adentro.",
      ayuda: "Guardar la basura a propósito es contraintuitivo, y es la decisión más importante del modelo. Una corrección es una hipótesis y las hipótesis cambian: si el 85 °C se hubiera vuelto NULL al cargar, hoy no habría cómo contar cuántas veces falló el sensor. El crudo no se reconstruye; una vista se reescribe en una tarde.",
      puntos: [
        "`monitoreo_sc_electrico` (5 min) y `radiacion_sc_15s` (15 s), cada una con PK `timestamp`.",
        "**RLS sin políticas** en las 9 tablas: solo entran los roles de servicio.",
      ],
      archivo: "sql/schema.sql",
    },
  },

  // ── Capa de vistas ───────────────────────────────────────────────────────
  {
    id: "vistas", grupo: "vista", x: COL_D.tabla, y: 196, w: ANCHO_D.tabla, h: 116,
    titulo: "4 vistas de análisis",
    sub: "corrección · calibración · PR",
    ficha: {
      hover: "Donde vive la corrección. Cada regla es una columna nueva calculada en SQL sobre el crudo, nunca una escritura sobre él.",
      hace: "Aplican en SQL, sobre el crudo y sin tocarlo, los tratamientos 4 a 9: rangos físicos, calibración contra el cielo despejado y Performance Ratio.",
      ayuda: "La otra mitad de la regla: el crudo queda intacto **y aun así se consulta dato limpio**. Cambiar un umbral es reescribir una vista, no recargar 130.000 filas, y el valor corregido se puede comparar contra el original en la misma consulta.",
      puntos: [
        "`v_sc_electrico_corregido` · `v_sc_radiacion_corregida`: rangos y offset. Todas con `security_invoker = on`, así la vista no elude los permisos de quien consulta.",
        "`v_sc_radiacion_calibrada`: W/m², kt\\* y control de calidad. **99,0 %** pasa QC.",
        "`v_sc_performance`: PR por arreglo. **PV1 = 0,621 · PV2 = 0,626**, convergen y validan el modelo bifacial.",
      ],
      archivo: "sql/schema.sql · src/agrovoltaic/ddl.py",
    },
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

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

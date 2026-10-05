// Un catálogo de mentira con la forma REAL del cable, para las pruebas.
//
// Se arma como lo manda el servicio y se pasa por el esquema de verdad: así una
// prueba de componente falla también cuando el backend renombra un campo, y no
// solo cuando cambia la pantalla. Los números salen de la medición del
// 2026-08-31 (45.270 filas eléctricas, 331 días con dato).
import {
  exportRelationsSchema,
  type ExportRelation,
} from "@/app/lib/analitica/contracts/exportar";

const FULL_WINDOW = { desde: "2024-11-10", hasta: "2026-08-31" };
/** La irradiancia anterior a mediados de 2025 se descartó: esa tabla empieza
 *  después, y es la que hace visible el recorte del rango. */
const CALIBRATED_WINDOW = { desde: "2025-07-01", hasta: "2026-08-31" };

type WireColumn = {
  nombre: string;
  etiqueta: string;
  unidad: string | null;
  por_defecto: boolean;
};

function column(nombre: string, etiqueta: string, unidad: string | null): WireColumn {
  return { nombre, etiqueta, unidad, por_defecto: true };
}

/** Contabilidad interna del ETL: viaja destildada. */
function bookkeeping(nombre: string, etiqueta: string): WireColumn {
  return { nombre, etiqueta, unidad: null, por_defecto: false };
}

const TIME = column("timestamp", "Marca de tiempo", null);
const ETL_COLUMNS = [
  bookkeeping("id", "Identificador de fila"),
  bookkeeping("archivo_origen", "Archivo del que se cargó"),
  bookkeeping("ingestado_en", "Sello de carga"),
];

const ELECTRIC_COLUMNS = [
  TIME,
  column("potencia_pv1_w", "Potencia PV1 (inclinado)", "W"),
  column("potencia_pv2_w", "Potencia PV2 (vertical)", "W"),
  column("voltaje_pv1_v", "Voltaje PV1 (inclinado)", "V"),
  column("corriente_pv1_a", "Corriente PV1 (inclinado)", "A"),
  column("voltaje_vac", "Voltaje AC", "V"),
  ...ETL_COLUMNS,
];

const RADIATION_COLUMNS = [
  TIME,
  column("irradiancia_wm2", "Irradiancia incidente", "W/m2"),
  column("irradiancia_reflejada_wm2", "Irradiancia reflejada", "W/m2"),
  ...ETL_COLUMNS,
];

const PERFORMANCE_COLUMNS = [
  column("dia", "Día", null),
  column("pr_inclinado", "Performance Ratio (inclinado)", null),
  column("pr_vertical", "Performance Ratio (vertical)", null),
  bookkeeping("variante", "Variante de cálculo"),
];

const DICTIONARY_COLUMNS = [
  column("columna", "Nombre de la columna", null),
  column("definicion", "Qué mide", null),
  column("unidad", "Unidad", null),
];

function relation(
  clave: string,
  etiqueta: string,
  descripcion: string,
  filas: number,
  columnas: readonly WireColumn[],
  ventana: { desde: string; hasta: string } | null,
  columna_tiempo: string | null = "timestamp",
) {
  return {
    clave,
    etiqueta,
    descripcion,
    columna_tiempo,
    filas,
    desde: ventana?.desde ?? null,
    hasta: ventana?.hasta ?? null,
    columnas,
  };
}

const WIRE = {
  relaciones: [
    relation("electrico_crudo", "Eléctrico (crudo)", "Lo que llegó del inversor, sin tocar.", 45_270, ELECTRIC_COLUMNS, FULL_WINDOW),
    relation("electrico_corregido", "Eléctrico (corregido)", "Con las correcciones de la capa de análisis aplicadas.", 45_270, ELECTRIC_COLUMNS, FULL_WINDOW),
    relation("radiacion_cruda", "Radiación (cruda)", "Lecturas del piranómetro sin calibrar, a 15 segundos.", 512_340, RADIATION_COLUMNS, FULL_WINDOW),
    relation("radiacion_corregida", "Radiación (corregida)", "Con el offset nocturno y los fuera de rango marcados.", 512_340, RADIATION_COLUMNS, FULL_WINDOW),
    relation("radiacion_calibrada", "Radiación (calibrada)", "Calibrada por cielo despejado. Solo desde mediados de 2025.", 198_400, RADIATION_COLUMNS, CALIBRATED_WINDOW),
    relation("radiacion_clearsky", "Radiación (cielo despejado)", "Irradiancia modelada con pvlib para el sitio.", 512_340, RADIATION_COLUMNS, FULL_WINDOW),
    relation("radiacion_poa", "Radiación (plano del arreglo)", "POA por arreglo. Transposición pendiente del aval de Hugo.", 512_340, RADIATION_COLUMNS, FULL_WINDOW),
    relation("performance", "Performance Ratio (diario)", "El PR por día y por arreglo, con su variante de cálculo.", 331, PERFORMANCE_COLUMNS, FULL_WINDOW, "dia"),
    relation("diccionario", "Diccionario de variables", "Qué mide cada columna y en qué unidad.", 148, DICTIONARY_COLUMNS, null, null),
  ],
};

export const EXPORT_RELATIONS: readonly ExportRelation[] = exportRelationsSchema.parse(WIRE);

export function relationByKey(key: string): ExportRelation {
  const found = EXPORT_RELATIONS.find((relation) => relation.key === key);
  if (!found) throw new Error(`la fixture no tiene la relación ${key}`);
  return found;
}

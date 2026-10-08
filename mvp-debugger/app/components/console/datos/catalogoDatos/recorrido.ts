import type { Ficha } from "@/app/components/console/arquitectura/catalogo";

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
// SIN GEOMETRÍA. La primera versión posicionaba los actos en coordenadas
// absolutas sobre un lienzo de 1140 px fijos: en una pantalla ancha sobraba
// espacio a los lados y en una angosta había que arrastrar. Ahora el ancho lo
// reparte flex, y cada zona recibe una fracción proporcional a cuántos actos
// tiene, así todas las cajas salen del mismo ancho sin declararlo.
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
  /** Qué pasa acá, en dos o tres palabras. */
  titulo: string;
  /** El detalle operativo del paso, en una línea corta. */
  gesto: string;
  muestra: Muestra;
  /** Por qué se hace así y no de otra forma. Una frase. */
  porque: string;
  ficha: Ficha;
};


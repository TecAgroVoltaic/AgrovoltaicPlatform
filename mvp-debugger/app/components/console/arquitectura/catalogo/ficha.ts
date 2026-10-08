/** Lo que un humano necesita saber y el esquema no dice. */
export type Ficha = {
  /** Rótulo corto del nodo en el lienzo. Sin él se usa la descripción del servicio. */
  resumen?: string;
  /** Una línea, texto plano: va al `data-tip` que consume ChartTooltip. */
  hover: string;
  /** Markdown. QUÉ hace, en una o dos frases. Sin justificar: eso va en `ayuda`. */
  hace: string;
  /**
   * Markdown. EN QUÉ AYUDA: qué sería peor sin esta pieza, con un número medido
   * cuando exista. Es la pregunta que el esquema no contesta y la que de verdad
   * justifica que la pieza exista; separarla de `hace` evita el párrafo denso que
   * mezclaba mecanismo con motivo y no respondía bien ninguno de los dos.
   */
  ayuda?: string;
  devuelve?: string[];
  limites?: string[];
  puntos?: string[];
  pruebas?: string[];
  archivo?: string;
};

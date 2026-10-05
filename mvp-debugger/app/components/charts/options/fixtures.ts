// Lo que comparten las pruebas de esta carpeta: un tema de colores falsos y los
// anchos de lienzo REALES de la consola.
//
// El tema estaba copiado en cuatro archivos de prueba. Los anchos importan más:
// una opción de ECharts se escribe en píxeles, así que probarla a un ancho
// inventado no dice nada. Estos se midieron en el navegador con la vista
// Estadística montada, y son los que hay que sostener.
//
// No entra en el bundle: solo lo importan archivos de prueba, igual que
// `chartGeometry` y los `fixtures.ts` de calidad y de comparativa.
import type { CanvasSize } from "@/app/components/charts/options/chartGeometry";
import type { ChartTheme } from "@/app/components/charts/theme";

export const TEST_THEME: ChartTheme = {
  ink: "#111", ink2: "#222", muted: "#333", grid: "#444", line: "#555",
  panel: "#666", raise: "#777",
  series: { accent: "#a", real: "#b", pred: "#c", ceil: "#d", good: "#e", warn: "#f", crit: "#0" },
  palette: ["#a", "#b"],
  monoFamily: "monospace",
  animate: false,
};

/** El lienzo más angosto en que se usan estos gráficos: ventana de 360 px, que
 * es el teléfono pequeño de referencia. Descuenta el relleno del contenido (16
 * por lado) y el de la tarjeta del gráfico (20 por lado más el borde). El alto
 * es el que le da la razón de aspecto de `chartBox` a ese ancho. */
export const PHONE_CANVAS: CanvasSize = { width: 286, height: 240 };

/** El mismo teléfono para el mapa de calor, que es el único gráfico con alto
 *  fijo: sus 24 filas de hora no salen del ancho. */
export const PHONE_HEATMAP_CANVAS: CanvasSize = { width: 286, height: 420 };

/** Ventana de 1.024: la barra lateral se lleva 230 px y las figuras van de a una
 * por fila. Es el ancho intermedio que la vista Estadística usa más. */
export const LAPTOP_CANVAS: CanvasSize = { width: 754, height: 340 };

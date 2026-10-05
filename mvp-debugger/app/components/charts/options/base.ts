// Piezas comunes de todas las opciones de ECharts: rejilla, ejes, tooltip y
// formato de números. Están acá para que doce gráficos no acaben con doce
// rejillas distintas, y para que el estilo salga del tema y no de cada archivo.
import { nfmt } from "@/app/lib/client";
import { legendTextWidth, type ChartCanvas } from "@/app/components/charts/options/canvas";
import type { ChartOption } from "@/app/components/charts/echarts";
import type { ChartTheme } from "@/app/components/charts/theme";

const AXIS_FONT_SIZE = 11;
const AXIS_NAME_GAP = 12;
const DEFAULT_DECIMALS = 1;

/** Margen del área de dibujo. ECharts reserva lo que necesiten las etiquetas y
 * los nombres de los ejes: fijar un `left` a ojo recorta los números grandes.
 *
 * `outerBoundsMode: "same"` + `outerBoundsContain: "all"` es el `containLabel`
 * de siempre MÁS los nombres de eje (ECharts documenta `containLabel` como
 * `{outerBoundsMode: "same", outerBoundsContain: "axisLabel"}`, o sea etiquetas
 * y nada más). Sin esto, la unidad del eje no entra en la cuenta del espacio y
 * se sale del lienzo: `kWh/m2` empezaba en x = −3. */
export const CHART_GRID = {
  left: 8,
  right: 16,
  top: 26,
  bottom: 8,
  outerBoundsMode: "same" as const,
  outerBoundsContain: "all" as const,
};

export const NO_DATA_TEXT = "sin dato";

/** Lo que comparten TODAS las opciones. `useUTC` no es un detalle: los
 * timestamps de la base están etiquetados UTC pero guardan hora local de Costa
 * Rica. Con `useUTC: true` el eje los pinta tal cual vienen; sin él, el
 * navegador de quien mire desde otra zona correría seis horas todos los
 * perfiles diarios y el mapa de calor por hora. */
export function baseOption(theme: ChartTheme): ChartOption {
  return {
    useUTC: true,
    animation: theme.animate,
    backgroundColor: "transparent",
    textStyle: { color: theme.ink2, fontSize: AXIS_FONT_SIZE },
    grid: CHART_GRID,
  };
}

export function axisLine(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.line } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: AXIS_FONT_SIZE, hideOverlap: true },
  };
}

export function splitLine(theme: ChartTheme) {
  return { splitLine: { lineStyle: { color: theme.grid, type: "solid" as const } } };
}

export function categoryAxis(theme: ChartTheme, categories: readonly string[]) {
  return {
    type: "category" as const,
    data: [...categories],
    boundaryGap: true,
    ...axisLine(theme),
  };
}

export function timeAxis(theme: ChartTheme) {
  return { type: "time" as const, ...axisLine(theme) };
}

/** El eje numérico, con la unidad como nombre.
 *
 * El nombre va en `nameLocation: "end"` (el defecto de ECharts), o sea pegado al
 * extremo del eje. Con `align: "left"` el texto arrancaba en ese extremo y crecía
 * hacia AFUERA: en el eje X eso es fuera del lienzo, y la unidad salía cortada a
 * cualquier ancho, no por falta de espacio sino por dónde empieza el texto. Con
 * `align: "right"` termina en el extremo y crece hacia adentro. El espacio se lo
 * reserva `CHART_GRID`. */
export function valueAxis(theme: ChartTheme, name?: string) {
  return {
    type: "value" as const,
    name,
    nameGap: AXIS_NAME_GAP,
    nameTextStyle: { color: theme.muted, fontSize: AXIS_FONT_SIZE, align: "right" as const },
    scale: true,
    ...axisLine(theme),
    ...splitLine(theme),
  };
}

export function tooltipBase(theme: ChartTheme) {
  return {
    backgroundColor: theme.raise,
    borderColor: theme.line,
    borderWidth: 1,
    textStyle: { color: theme.ink, fontSize: 12 },
    // `confine` mete el globo DENTRO del lienzo. Sin él, en un teléfono el
    // tooltip de un punto del borde derecho se dibuja fuera de la pantalla y no
    // hay forma de leerlo: la página no desplaza en horizontal (`.content` corta
    // el desborde), así que el dato simplemente no existe para quien mira.
    confine: true,
    extraCssText: "box-shadow:0 4px 14px #0000001f;",
  };
}

/** La leyenda común. Dos decisiones que a 286 px son la diferencia entre leerla
 * y no leerla, y que se miden en `overflow.test`:
 *
 * `type: "scroll"` en vez de la leyenda simple. La simple apila los ítems que no
 * entran en filas nuevas y se sienta encima de la trama, porque el `top` de la
 * rejilla es un número fijo que no sabe cuántas filas salieron. La paginada
 * ocupa SIEMPRE una fila, mida lo que mida la lista, y en pantalla ancha se ve
 * igual que la simple porque las flechas solo aparecen si hacen falta.
 *
 * `textStyle.width` + `truncate`. Los nombres de este sistema llegan a 324 px,
 * más que el lienzo entero de un teléfono: sin tope se recortan contra el filo
 * y se lee "ergía AC acumulada de vida…", cortado justo por delante. Con el tope
 * se recorta por el final, que es donde sobra. */
export function legendBase(theme: ChartTheme, canvas: ChartCanvas) {
  return {
    type: "scroll" as const,
    top: 0,
    textStyle: {
      color: theme.ink2,
      width: legendTextWidth(canvas),
      overflow: "truncate" as const,
    },
    icon: "roundRect" as const,
    // Las flechas de paginación vienen en un azul oscuro fijo que sobre el panel
    // oscuro de la consola no se ve: sin esto la leyenda parece no tener más.
    pageIconColor: theme.ink2,
    pageIconInactiveColor: theme.muted,
    pageTextStyle: { color: theme.muted },
  };
}

/** Un número con el formato del resto de la consola, o el texto de ausencia.
 * Nunca un cero: un hueco pintado como cero es la mentira que este producto
 * tiene que evitar. */
export function formatValue(
  value: number | null | undefined,
  unit = "",
  decimals = DEFAULT_DECIMALS,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_TEXT;
  return unit ? `${nfmt(value, decimals)} ${unit}` : nfmt(value, decimals);
}

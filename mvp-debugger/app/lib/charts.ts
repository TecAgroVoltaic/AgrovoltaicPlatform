"use client";
// Gráficas en SVG (sin librerías): devuelven un string de SVG que las vistas
// inyectan con dangerouslySetInnerHTML. Cada punto lleva data-tip para el tooltip
// global (ver ChartTooltip). Portado 1:1 del prototipo de diseño. Cada gráfica
// vive en `charts/`; este archivo es su barril.
export { palette, type Palette } from "@/app/lib/charts/palette";
export { lineChart } from "@/app/lib/charts/lineChart";
export { barChart } from "@/app/lib/charts/barChart";
export { scatter, type MarcaScatter } from "@/app/lib/charts/scatter";
export { sparkline } from "@/app/lib/charts/sparkline";

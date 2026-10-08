// Base común de los iconos de la consola: SVG inline, trazo de 1.7, 16 px.

export type IconProps = { size?: number; className?: string };

/** Atributos compartidos por todo `<svg>` del juego de iconos. */
export const iconSvgProps = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

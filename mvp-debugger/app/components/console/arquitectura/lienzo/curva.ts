const TENSION_MINIMA = 26;
const TENSION_RELATIVA = 0.55;

/** Curva horizontal suave entre dos puertos. La usan los dos lienzos. */
export function curva(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(TENSION_MINIMA, Math.abs(x2 - x1) * TENSION_RELATIVA);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

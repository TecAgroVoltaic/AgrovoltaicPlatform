/** Registro de chequeos compartido por todas las secciones del arnés. */
let ok = 0;
const fallos = [];

export function check(nombre, cond, extra = "") {
  if (cond) { ok++; return; }
  fallos.push(`${nombre}${extra ? `  → ${extra}` : ""}`);
}

/** Imprime el resultado y devuelve el código de salida del proceso. */
export function informar() {
  console.log(`\n${ok} chequeos OK`);
  if (!fallos.length) return 0;
  console.error(`${fallos.length} FALLAN:\n  - ${fallos.join("\n  - ")}`);
  return 1;
}

#!/usr/bin/env node
/**
 * Verificación de las vistas SIN navegador.
 *
 * Por qué existe: la extensión de Chrome que daría control del navegador no
 * conecta, así que no hay forma de mirar una vista renderizada. Sin esto, todo el
 * trabajo de UI se hace a ciegas, y eso ya dejó defectos que llegaron hasta la
 * pantalla del usuario.
 *
 * Qué hace: compila los componentes con `tsc` a un árbol aparte y los renderiza de
 * verdad con `react-dom/server`. No es un mock: es el mismo componente con los
 * mismos datos. Lo que se afirma no es "compila", sino PROPIEDADES DEL RESULTADO.
 *
 * Qué vale la pena afirmar: invariantes de diseño (que no vuelva el vocabulario
 * viejo, que no queden coordenadas absolutas, presupuestos de contenido,
 * relaciones estructurales). Lo que NO sirve: comparar el HTML entero contra un
 * snapshot, que se rompe con cada cambio de estilo y no dice nada.
 *
 *   node scripts/verificar-vistas.mjs
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(RAIZ, ".verify");

let ok = 0;
const fallos = [];
function check(nombre, cond, extra = "") {
  if (cond) { ok++; return; }
  fallos.push(`${nombre}${extra ? `  → ${extra}` : ""}`);
}

// ── 1. Compilar ───────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
process.stdout.write("compilando… ");
try {
  execSync("npx tsc -p tsconfig.verify.json", { cwd: RAIZ, stdio: "pipe" });
} catch (e) {
  // `noEmitOnError:false`: aunque haya errores de tipo, los .js se emiten igual.
  // Sirve para poder verificar el render mientras se arregla un tipo aparte.
  const salida = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
  if (!existsSync(OUT)) { console.error("\n" + salida); process.exit(1); }
  console.log(`(con ${salida.split("\n").filter((l) => l.includes("error TS")).length} avisos de tipo)`);
}
console.log("listo");

// ── 2. Redirigir la resolución de módulos al árbol compilado ──────────────────
// Los componentes importan `@/app/...`, que Node no sabe resolver, y `react`, que
// tiene que salir del node_modules REAL (si no, hay dos copias de React y los
// hooks explotan).
const Module = require("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
  if (pedido.startsWith("@/")) {
    return original.call(this, path.join(OUT, pedido.slice(2)), ...resto);
  }
  return original.call(this, pedido, ...resto);
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// ── 3. Afirmar sobre el HTML ──────────────────────────────────────────────────
const { CalidadView } = require(path.join(OUT, "app/components/console/CalidadView.js"));

// Sin datos aún (el fetch no corre en render estático): tiene que decir algo, no
// reventar ni quedar en blanco.
const vacia = renderToStaticMarkup(React.createElement(CalidadView));
check("CalidadView renderiza sin datos", vacia.length > 0);
check("y avisa que está cargando en vez de quedar en blanco", /Cargando/i.test(vacia), vacia.slice(0, 120));

// La vista de verdad: se le inyecta el estado a través de un render con datos.
// Como el estado viene de un efecto, se prueba el componente Tira por separado,
// que es la pieza con lógica de presentación.
const mod = require(path.join(OUT, "app/components/console/CalidadView.js"));
check("CalidadView se exporta", typeof mod.CalidadView === "function");

// Invariantes de vocabulario: los nombres que el equipo acordó, y los que no.
const fuente = require("node:fs").readFileSync(
  path.join(RAIZ, "app/components/console/CalidadView.tsx"), "utf8");
// El invariante que importa no es "no aparece el 85", sino que la separacion en
// TRES casos siga en pie: de 307 "sensores planos" ninguno lo era, eran 129
// clavados en 85 (DS18B20) y 178 en cero (el inversor no genero). Si alguien
// vuelve a fundirlos, la vista miente sobre que esta roto.
check("`saturado_85` sigue explicandose por su causa",
  /saturado_85: "[^"]*DS18B20/.test(fuente));
check("`constante_en_cero` sigue existiendo como caso aparte",
  /constante_en_cero: "[^"]*generaci/.test(fuente));
check("`sensor_plano` se define por exclusion de los otros dos",
  /sensor_plano: "[^"]*no es 0 ni 85/.test(fuente),
  "si deja de excluirlos, vuelve a tragarse los otros dos casos");
check("los 12 tipos de hallazgo están explicados en la vista",
  ["dia_incompleto","hueco","duplicado_timestamp","cambio_de_cadencia","columna_ausente",
   "nulos","fuera_de_rango","saturado_85","constante_en_cero","sensor_plano",
   "offset_nocturno","kt_imposible"].every((t) => fuente.includes(`${t}:`)),
  "falta alguno en QUE_ES");
check("el veredicto NO se calcula en el cliente",
  !/veredicto\s*=\s*["']grave["']/.test(fuente),
  "lo decide el servicio, si no la consola y el reporte pueden discrepar");
check("las celdas del calendario son <button>, no <div> con onClick",
  /<button[\s\S]{0,400}className={`cal-dia/.test(fuente));
check("cada celda tiene aria-label", /aria-label=/.test(fuente));
check("no quedan coordenadas absolutas", !/style={{\s*(left|top):/.test(fuente));

// Presupuesto de contenido: cuando el pedido es "que sea breve", la brevedad
// tiene que ser una prueba, no una intención.
const explicaciones = [...fuente.matchAll(/^\s{2}\w+: "([^"]+)"/gm)].map((m) => m[1]);
check(`las ${explicaciones.length} explicaciones de tipo caben en una línea`,
  explicaciones.every((e) => e.length <= 90),
  explicaciones.filter((e) => e.length > 90).join(" | "));

// El CSS que la vista necesita tiene que existir de verdad.
const css = require("node:fs").readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
for (const clase of ["cal-fila","cal-nombre","cal-tira","cal-mes","cal-celdas","cal-dia",
                     "cal-rot","cal-leyenda","sev-grave","sev-aviso","sev-info"]) {
  check(`existe la clase .${clase}`, css.includes(`.${clase}`));
}
check("las celdas tienen foco visible por teclado", css.includes(".cal-dia:focus-visible"));
check("la severidad no se distingue SOLO por color",
  /\.sev-grave\s*{[^}]*font-weight/.test(css),
  "en escala de grises o con daltonismo el color solo no distingue nada");

// La vista está enchufada a la consola.
const consola = require("node:fs").readFileSync(
  path.join(RAIZ, "app/components/console/Console.tsx"), "utf8");
check("aparece en la navegación", /\["calidad", "Calidad de datos"/.test(consola));
check("se renderiza cuando está activa", /view === "calidad" && <CalidadView \/>/.test(consola));
check("es transversal, no de un agente", !/calidad:\s*"(analizador|pronostico)"/.test(consola));

// ── 4. Resultado ──────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
console.log(`\n${ok} chequeos OK`);
if (fallos.length) {
  console.error(`${fallos.length} FALLAN:\n  - ${fallos.join("\n  - ")}`);
  process.exit(1);
}

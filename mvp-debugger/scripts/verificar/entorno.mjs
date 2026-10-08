/**
 * Entorno del arnés: compila las vistas a un árbol aparte, redirige la resolución
 * de módulos a ese árbol y ofrece lectores de fuentes y estilos.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const require = createRequire(import.meta.url);
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT = path.join(RAIZ, ".verify");

export function compilar() {
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
}

export function limpiar() {
  rmSync(OUT, { recursive: true, force: true });
}

// Los componentes importan `@/app/...`, que Node no sabe resolver, y `react`, que
// tiene que salir del node_modules REAL (si no, hay dos copias de React y los
// hooks explotan).
export function redirigirModulos() {
  const Module = require("node:module");
  const original = Module._resolveFilename;
  Module._resolveFilename = function (pedido, ...resto) {
    if (pedido.startsWith("@/")) {
      return original.call(this, path.join(OUT, pedido.slice(2)), ...resto);
    }
    return original.call(this, pedido, ...resto);
  };
}

/** Módulo compilado, por su ruta relativa a la raíz y con extensión `.js`. */
export const cargar = (relativa) => require(path.join(OUT, relativa));

/** HTML estático de un componente compilado, con el React real. */
export function renderizar(Componente, props) {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return renderToStaticMarkup(React.createElement(Componente, props));
}

const esFuente = (nombre) => /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre);

function archivosDe(dir, acepta) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) return /node_modules|\.next|\.verify/.test(f) ? [] : archivosDe(f, acepta);
      return acepta(e.name) ? [f] : [];
    });
}

/**
 * Texto fuente de uno o más archivos o carpetas, concatenado. Una carpeta aporta
 * todos sus .ts/.tsx (sin pruebas): así un chequeo sobre una vista sigue valiendo
 * aunque la vista se parta en subcomponentes.
 */
export function fuente(...rutas) {
  return rutas.map((r) => {
    const abs = path.join(RAIZ, r);
    if (!statSync(abs).isDirectory()) return readFileSync(abs, "utf8");
    return archivosDe(abs, esFuente).map((f) => readFileSync(f, "utf8")).join("\n");
  }).join("\n");
}

/** Todas las hojas de estilo globales (no CSS Modules), `globals.css` primero. */
export function estilosGlobales() {
  const globales = path.join(RAIZ, "app/globals.css");
  const resto = archivosDe(path.join(RAIZ, "app"),
    (n) => n.endsWith(".css") && !n.endsWith(".module.css"))
    .filter((f) => f !== globales);
  return [globales, ...resto].filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
}

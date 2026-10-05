#!/usr/bin/env node
// Guard de zona horaria: ningún archivo de la consola usa el reloj LOCAL del
// navegador. Toda cuenta de fechas pasa por `app/lib/tiempo.ts`.
//
//   node scripts/smoke-zona-horaria.mjs
//
// Por qué existe: la consola muestra hora de Costa Rica, no la de quien mira.
// Cada API de `Date` que lee el reloj local (`getHours`, `setDate`,
// `toLocaleString` sin zona, `new Date("...T00:00:00")` sin `Z`) da un resultado
// distinto según dónde esté el navegador, y el error no se ve desde Costa Rica:
// solo aparece cuando alguien abre la consola en otra zona. Ya pasó dos veces.
// Un test no alcanza, porque prueba el código que existe y no el que se va a
// escribir; esto corta el patrón en la puerta.
//
// No analiza el programa: busca texto. Si una línea necesita de verdad el reloj
// local, se marca con `// zona-horaria: ok <motivo>` y el guard la deja pasar.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const FUENTE = join(RAIZ, "app");
const PERMITIDO = "// zona-horaria: ok";

// El único archivo que puede hablar de zonas, y los tests (que fijan fechas).
const EXENTOS = [/app\/lib\/tiempo\.ts$/, /\.test\.tsx?$/];

const REGLAS = [
  {
    patron: /\.(getHours|getMinutes|getSeconds|getDate|getDay|getMonth|getFullYear|getYear|getTimezoneOffset)\(/,
    porque: "lee el reloj local del navegador",
    usar: "moverReloj / hoyEnSitio de app/lib/tiempo.ts (o los getUTC* si es aritmética UTC)",
  },
  {
    patron: /\.(setHours|setMinutes|setSeconds|setDate|setMonth|setFullYear)\(/,
    porque: "mueve la fecha en el reloj local del navegador",
    usar: "moverDias / moverReloj de app/lib/tiempo.ts",
  },
  {
    // new Date("2026-10-03T00:00:00") o con plantilla, sin Z ni offset al final.
    patron: /new Date\(\s*[`"'][^`"']*T\d{2}:\d{2}(:\d{2})?[`"']\s*\)|new Date\([^)]*\+\s*["'`]T\d{2}:\d{2}(:\d{2})?["'`]\s*\)/,
    porque: "interpreta una hora sin zona como hora local del navegador",
    usar: "moverDias / moverReloj de app/lib/tiempo.ts",
  },
  {
    patron: /\.toLocale(Date|Time)String\(/,
    porque: "formatea una fecha en la zona del navegador",
    usar: "instanteEnSitio / diaEnSitio de app/lib/tiempo.ts",
  },
  {
    // toLocaleString con dateStyle/timeStyle/hour/... y sin timeZone: es de fecha.
    patron: /\.toLocaleString\([^)]*(dateStyle|timeStyle|hour|minute|weekday|month|year)\b(?![^)]*timeZone)/,
    porque: "formatea una fecha en la zona del navegador",
    usar: "instanteEnSitio / diaEnSitio de app/lib/tiempo.ts",
  },
  {
    patron: /Intl\.DateTimeFormat\((?![^)]*timeZone)/,
    porque: "formatea una fecha sin fijar la zona",
    usar: "las funciones de app/lib/tiempo.ts",
  },
];

function archivos(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

const hallazgos = [];
for (const ruta of archivos(FUENTE)) {
  const rel = relative(RAIZ, ruta);
  if (EXENTOS.some((e) => e.test(rel))) continue;
  readFileSync(ruta, "utf8").split("\n").forEach((linea, i) => {
    const codigo = linea.trim();
    if (codigo.startsWith("//") || codigo.startsWith("*") || linea.includes(PERMITIDO)) return;
    for (const regla of REGLAS) {
      if (regla.patron.test(linea)) {
        hallazgos.push({ rel, n: i + 1, codigo, regla });
        break;
      }
    }
  });
}

if (hallazgos.length) {
  console.error(`>> ${hallazgos.length} uso(s) del reloj local del navegador:\n`);
  for (const h of hallazgos) {
    console.error(`  ${h.rel}:${h.n}`);
    console.error(`    ${h.codigo.slice(0, 140)}`);
    console.error(`    ${h.regla.porque} -> usar ${h.regla.usar}\n`);
  }
  process.exit(1);
}
console.log(">> todo ok: ninguna fecha depende de la zona del navegador");

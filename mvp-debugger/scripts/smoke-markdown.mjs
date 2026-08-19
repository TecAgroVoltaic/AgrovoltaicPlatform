#!/usr/bin/env node
// Smoke del renderizador de markdown de las respuestas del agente.
//
// Por qué existe: la vista mostraba los pipes y los guiones crudos cuando el
// modelo respondía con una tabla — que es la forma natural de poner "real /
// predicho / error", o sea el caso MÁS común de este sistema. Se veía roto sin
// estarlo, y no había nada que lo detectara.
//
// Se compila el .ts real con el tsc del proyecto (nada de reimplementarlo acá) y
// se le pasa una respuesta como las que devuelve el agente.
//
//   node scripts/smoke-markdown.mjs
//
// Sale con código != 0 al primer caso que falle (lo usa el CI).
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const salida = mkdtempSync(join(tmpdir(), "md-"));
execFileSync("npx", ["tsc", "app/lib/markdown.ts", "--outDir", salida,
                     "--module", "esnext", "--target", "es2020",
                     "--moduleResolution", "bundler"], { stdio: "inherit" });
const js = join(salida, "markdown.mjs");
renameSync(join(salida, "markdown.js"), js);
const { renderMd } = await import(js);

let fallos = 0;
function verificar(descripcion, condicion, detalle = "") {
  if (condicion) {
    console.log(`  ok    ${descripcion}`);
  } else {
    console.log(`  FALLA ${descripcion}${detalle ? "  " + detalle : ""}`);
    fallos++;
  }
}

// Una respuesta real del agente (tabla + negritas + código + lista).
const RESPUESTA = `**Reconstrucción del método para el 22 de julio a las 09:00**:

| Métrica | Valor |
|---------|-------|
| **Irradiancia real medida** | 48.35 W/m² |
| **Error** | −2.04 W/m² |

A las 09:00 el cielo estaba nublado y \`persistencia\` funciona bien.

- primer punto
- segundo punto`;

const html = renderMd(RESPUESTA);
const texto = html.replace(/<[^>]+>/g, "");

console.log(">> tabla markdown");
verificar("no quedan pipes visibles", !/\|/.test(texto));
verificar("no queda la fila separadora", !/-{3,}/.test(texto));
verificar("se genera una <table>", html.includes("<table"));
verificar("la cabecera va en <th>", html.includes("<th>Métrica</th>"));
verificar("las negritas dentro de las celdas se aplican", html.includes("<td><strong>"));

console.log(">> otros bloques");
verificar("lista con viñetas -> <ul>", html.includes("<ul"));
verificar("código inline -> <code>", html.includes("<code>persistencia</code>"));
verificar("párrafos separados", (html.match(/<p>/g) || []).length >= 2);
verificar("numeradas -> <ol>", renderMd("1. uno\n2. dos").includes("<ol"));
verificar("cursiva -> <em>", renderMd("esto es *importante* acá").includes("<em>"));

console.log(">> seguridad");
verificar("el HTML del modelo se escapa",
          !renderMd('<img src=x onerror="alert(1)">').includes("<img"));
verificar("los & se escapan", renderMd("a & b").includes("&amp;"));

console.log(">> robustez");
verificar("texto vacío no revienta", renderMd("") === "");
verificar("null no revienta", renderMd(null) === "");
verificar("una tabla sin separador queda como párrafo, no se pierde",
          renderMd("| a | b |").includes("| a | b |"));

rmSync(salida, { recursive: true, force: true });

if (fallos > 0) {
  console.log(`>> ${fallos} caso(s) fallaron`);
  process.exit(1);
}
console.log(">> todo ok");

"use client";
// Markdown mínimo para lo que redactan los agentes: párrafos, negrita, cursiva,
// código, listas y TABLAS.
//
// Por qué existe: `inlineMd` solo resolvía negritas, así que cuando el agente
// respondía con una tabla (cosa que hace seguido, porque es la forma natural de
// poner "real / predicho / error"), la vista mostraba los pipes y los guiones
// crudos. Se veía roto sin estarlo.
//
// Por qué a mano y no una librería: el debugger no tiene dependencias de UI a
// propósito, y esto es un subconjunto acotado: no hace falta un parser
// CommonMark para renderizar lo que escribe un LLM al que además se le pide que
// sea breve.
//
// Seguridad: se escapa TODO el HTML de entrada antes de aplicar formato, así que
// el texto del modelo no puede inyectar marcado. Solo las etiquetas que genera
// este módulo llegan al DOM.

const BLOQUE_LISTA = /^\s*([-*•]|\d+[.)])\s+/;
const SEPARADOR_TABLA = /^\s*\|?[\s:\-|]+\|[\s:\-|]*$/;

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Formato dentro de una línea: negrita, cursiva, código. */
function enLinea(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");
}

/** Celdas de una fila de tabla markdown (tolera el pipe inicial/final o su ausencia). */
function celdas(linea: string): string[] {
  return linea.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

function esFilaTabla(linea: string): boolean {
  return linea.includes("|") && linea.trim().length > 1;
}

/**
 * Renderiza markdown acotado a HTML. Devuelve un string listo para inyectar
 * (ya escapado). Nunca lanza: ante algo raro, cae a párrafo.
 */
export function renderMd(texto: string): string {
  const lineas = escapar(String(texto || "")).split("\n");
  const salida: string[] = [];
  let i = 0;

  const parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (!parrafo.length) return;
    salida.push(`<p>${enLinea(parrafo.join("\n")).replace(/\n/g, "<br/>")}</p>`);
    parrafo.length = 0;
  };

  while (i < lineas.length) {
    const linea = lineas[i];

    if (!linea.trim()) { cerrarParrafo(); i++; continue; }

    // Tabla: fila con pipes seguida de una fila separadora (|---|---|).
    if (esFilaTabla(linea) && i + 1 < lineas.length && SEPARADOR_TABLA.test(lineas[i + 1])) {
      cerrarParrafo();
      const cabecera = celdas(linea);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && esFilaTabla(lineas[i]) && lineas[i].trim()) {
        filas.push(celdas(lineas[i]));
        i++;
      }
      salida.push(
        '<div class="md-tabla-wrap"><table class="md-tabla"><thead><tr>'
        + cabecera.map((c) => `<th>${enLinea(c)}</th>`).join("")
        + "</tr></thead><tbody>"
        + filas.map((f) => "<tr>" + f.map((c) => `<td>${enLinea(c)}</td>`).join("") + "</tr>").join("")
        + "</tbody></table></div>",
      );
      continue;
    }

    // Encabezado (#, ##, …): el agente casi no los usa, pero si aparecen no
    // pueden quedar como almohadillas sueltas.
    const enc = linea.match(/^\s*(#{1,6})\s+(.*)$/);
    if (enc) {
      cerrarParrafo();
      salida.push(`<p class="md-h"><strong>${enLinea(enc[2])}</strong></p>`);
      i++;
      continue;
    }

    // Lista (con viñeta o numerada).
    if (BLOQUE_LISTA.test(linea)) {
      cerrarParrafo();
      const ordenada = /^\s*\d+[.)]\s+/.test(linea);
      const items: string[] = [];
      while (i < lineas.length && BLOQUE_LISTA.test(lineas[i])) {
        items.push(`<li>${enLinea(lineas[i].replace(BLOQUE_LISTA, ""))}</li>`);
        i++;
      }
      const tag = ordenada ? "ol" : "ul";
      salida.push(`<${tag} class="md-lista">${items.join("")}</${tag}>`);
      continue;
    }

    parrafo.push(linea);
    i++;
  }
  cerrarParrafo();
  return salida.join("");
}

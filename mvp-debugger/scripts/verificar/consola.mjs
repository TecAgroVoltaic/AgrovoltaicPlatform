/** La barra de la consola: qué vista vive bajo qué agente y los nombres de agente. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { check } from "./registro.mjs";
import { RAIZ, fuente } from "./entorno.mjs";

const VISTAS_FIJAS = ["Base de datos", "Costo y uso", "Salud del sistema"];
const MUESTRA_DE_NOMBRES_VIEJOS = 8;
const NOMBRES_VIEJOS = /Analizador|Comparador|Pron[óo]stico ambiental|analizadorActivo|\bANALIZADOR_|\bCOMPARADOR_|\bPRONOSTICO_|\/api\/(analizador|pronostico|comparador)/g;

/** Fuente de la consola: el contenedor y lo que se haya separado de él. */
export const fuenteConsola = () => fuente("app/components/console/Console.tsx", "app/components/console/shell");

export function verificarConsola() {
  const consola = fuenteConsola();
  check("aparece en la navegación", /\["calidad", "Calidad de datos"/.test(consola));
  check("se renderiza cuando está activa", /view === "calidad" && <CalidadView \/>/.test(consola));
  check("la vista de calidad pertenece al Histórico",
    /historico: \[[\s\S]{0,200}\["calidad"/.test(consola));
  check("«Predicción vs Real» pertenece al Predictivo",
    /predictivo: \[[\s\S]{0,120}\["pred"/.test(consola));
  check("«Arquitectura» está en los DOS agentes",
    (consola.match(/\["arq", "Arquitectura del agente"/g) || []).length === 2);
  check("y la vista recibe DE QUÉ agente es",
    /view === "arq" && <ArqView agent={agent} \/>/.test(consola),
    "sin el prop, los dos agentes vuelven a dibujar el mismo mapa");

  // La barra tiene dos mitades y se arma sola. Antes era una lista unica filtrada a
  // mano; con dos agentes y vistas propias eso se desincroniza solo.
  check("la nav se arma de VISTAS_AGENTE + VISTAS_FIJAS",
    /const vistas: \[View, string, Icono\]\[\] = \[\s*\.\.\.\(VISTAS_AGENTE\[agent\]/.test(consola));
  for (const fija of VISTAS_FIJAS) {
    check(`«${fija}» es fija (se ve con cualquier agente)`,
      new RegExp(`VISTAS_FIJAS[\\s\\S]{0,300}"${fija}"`).test(consola));
  }
  check("el separador se calcula, no está quemado",
    /v === VISTAS_FIJAS\[0\]\[0\]/.test(consola));

  // EL CHEQUEO QUE IMPORTA. Los agentes se llaman Histórico y Predictivo, y no hay
  // mas. Los nombres viejos (Analizador, Comparador, Pronóstico) se colaron una y
  // otra vez en renombres a medias; esto los caza en toda la consola de una.
  const viejos = buscarNombresViejos();
  check("no queda NINGÚN nombre viejo de agente en la consola", viejos.length === 0,
    [...new Set(viejos)].slice(0, MUESTRA_DE_NOMBRES_VIEJOS).join(" | "));
  check("los dos agentes se llaman Histórico y Predictivo",
    /nombre: "Agente Histórico"/.test(consola) && /nombre: "Agente Predictivo"/.test(consola));
  check("y son exactamente DOS",
    (consola.match(/^\s*\{ id: "/gm) || []).length === 2);
}

/** Recorre TODO `app/` (pruebas incluidas): un nombre viejo no vale en ningún lado. */
function buscarNombresViejos() {
  const viejos = [];
  const recorrer = (dir) => {
    for (const e of readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next|\.verify/.test(f)) recorrer(f); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      for (const m of readFileSync(path.join(RAIZ, f), "utf8").matchAll(NOMBRES_VIEJOS)) {
        viejos.push(`${f}: ${m[0]}`);
      }
    }
  };
  recorrer("app");
  return viejos;
}

"use client";
// Sección «Método y fórmulas»: la matemática del agente de pronóstico, cada
// expresión anclada al archivo del que sale. Se lee de corrido en UNA página
// (descomposición → kt* → persistencia → banda → evaluación); el código se parte
// en `metodo/` por tramos de lectura, pero la página sigue siendo una sola.
import { Page, Note, IC, Meta } from "@/app/docs/ui";
import { MetodoEvaluacion } from "@/app/docs/content/metodo/evaluacion";
import { MetodoPrediccion } from "@/app/docs/content/metodo/prediccion";

export function Metodo() {
  return (
    <Page
      crumb="Método y fórmulas"
      title="Método y fórmulas"
      lead="La matemática del agente de pronóstico, fórmula por fórmula, con el archivo del que sale cada una. No hay machine learning: hay física de cielo despejado y estadística robusta."
    >
      <Meta items={[
        ["Sitio", "10,33°N · −84,42°O · 600 m"],
        ["Cielo despejado", "Ineichen (pvlib)"],
        ["UMBRAL_CS", "20 W/m²"],
        ["Lookback", "60 min"],
        ["MIN_MUESTRAS", "3"],
        ["Horizonte", "60 s – 21 600 s"],
      ]} />
      <Note>
        <div><b>Cómo leer esta página.</b> Cada fórmula corresponde a una línea de código real, citada al lado. <IC>UMBRAL_CS</IC>, <IC>MIN_MUESTRAS</IC> y compañía son los identificadores del repositorio, no notación inventada para el documento.</div>
      </Note>

      <MetodoPrediccion />

      <MetodoEvaluacion />
    </Page>
  );
}

"use client";
// Despachador de la vista «Arquitectura del agente».
//
// Existe porque los dos agentes NO tienen la misma arquitectura y no se dejan
// dibujar con la misma plantilla:
//
//   * Predictivo — se organiza por MODOS. Su garantía es una ausencia: la
//     herramienta que revelaría la respuesta no está en la lista del modo.
//   * Histórico  — se organiza por FAMILIAS. Su garantía es una cadena: la
//     detección corre por lotes fuera del agente, deja un store, y las
//     herramientas lo leen con un pool que no puede escribir.
//
// Antes acá había una sola vista con la ruta del Predictivo fija, y la barra
// lateral la ofrecía bajo los dos agentes: con el Histórico seleccionado se
// dibujaba el mapa del Predictivo bajo el rótulo del Histórico. Un mapa de
// arquitectura equivocado y sin cartel de error es peor que una pantalla vacía,
// porque nadie lo verifica: parece que ya está.
import { ArqHistorico } from "./ArqHistorico";
import { ArqPredictivo } from "./ArqPredictivo";

export function ArqView({ agent }: { agent: string }) {
  return agent === "historico" ? <ArqHistorico /> : <ArqPredictivo />;
}

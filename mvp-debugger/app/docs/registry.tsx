"use client";
// Registro de secciones de la documentación: grupos del sidebar + mapa id→componente.
// La navegación se hace por hash (#id); ver DocsShell.
import type { ComponentType } from "react";
import { Overview, Glosario } from "./content/intro";
import { Arquitectura } from "./content/arquitectura";
import { DatosFuentes, DatosEsquema, DatosPipeline } from "./content/datos";
import { Analizador, Pronostico } from "./content/agentes";
import { WebArquitectura, WebConsola, WebChat } from "./content/web";
import { VfPlataforma, VfAgentes } from "./content/visioneflow";
import { Infra } from "./content/infra";

export type Sec = { id: string; title: string; Comp: ComponentType };
// `agente` marca los grupos que documentan UN agente concreto: si ese agente
// esta bloqueado en la consola, su documentacion tampoco se muestra (si no, la
// doc promete una seccion que no existe).
export type Grp = { label: string; items: Sec[]; agente?: "analizador" | "pronostico" };

const GRUPOS_TODOS: Grp[] = [
  { label: "Introducción", items: [
    { id: "overview", title: "Overview", Comp: Overview },
    { id: "glosario", title: "Glosario", Comp: Glosario },
  ] },
  { label: "Arquitectura", items: [
    { id: "arquitectura", title: "Topología del sistema", Comp: Arquitectura },
  ] },
  { label: "Datos · Supabase PV", items: [
    { id: "datos-fuentes", title: "Fuentes físicas y geometría", Comp: DatosFuentes },
    { id: "datos-esquema", title: "Esquema de la base", Comp: DatosEsquema },
    { id: "datos-pipeline", title: "Pipeline ETL y calidad", Comp: DatosPipeline },
  ] },
  { label: "Agente Analizador PV", agente: "analizador", items: [
    { id: "analizador", title: "Analizador PV", Comp: Analizador },
  ] },
  { label: "Agente Pronóstico", agente: "pronostico", items: [
    { id: "pronostico", title: "Pronóstico ambiental", Comp: Pronostico },
  ] },
  { label: "La web · mvp-debugger", items: [
    { id: "web", title: "Arquitectura y superficies", Comp: WebArquitectura },
    { id: "web-consola", title: "Vistas de la consola", Comp: WebConsola },
    { id: "web-chat", title: "Chat, traza y componentes", Comp: WebChat },
  ] },
  { label: "Infra de agentes · VisioneFlow", items: [
    { id: "visioneflow", title: "Plataforma y modelo de flujo", Comp: VfPlataforma },
    { id: "visioneflow-agentes", title: "Agentes en producción", Comp: VfAgentes },
  ] },
  { label: "Despliegue", items: [
    { id: "infra", title: "Local, EC2 y ruteo", Comp: Infra },
  ] },
];

export const DEFAULT_ID = "overview";

/** Grupos visibles segun que agentes estan habilitados en esta consola. */
export function grupos(analizadorActivo: boolean): Grp[] {
  return GRUPOS_TODOS.filter((g) => analizadorActivo || g.agente !== "analizador");
}

/** Secciones en orden + indice por id, derivados de los grupos visibles. */
export function indice(gs: Grp[]): { orden: Sec[]; porId: Record<string, Sec> } {
  const orden = gs.flatMap((g) => g.items);
  return { orden, porId: Object.fromEntries(orden.map((s) => [s.id, s])) };
}

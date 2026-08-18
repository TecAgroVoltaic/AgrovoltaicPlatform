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
export type Grp = { label: string; items: Sec[] };

export const GROUPS: Grp[] = [
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
  { label: "Agente Analizador PV", items: [
    { id: "analizador", title: "Analizador PV", Comp: Analizador },
  ] },
  { label: "Agente Pronóstico", items: [
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

export const ORDER: Sec[] = GROUPS.flatMap((g) => g.items);
export const BY_ID: Record<string, Sec> = Object.fromEntries(ORDER.map((s) => [s.id, s]));
export const DEFAULT_ID = "overview";

"use client";
// A que agente le habla la documentacion. Existe para no enhebrar un prop a
// traves del registro de secciones (los componentes de contenido se montan por
// referencia, sin props): el shell publica el agente activo y quien lo necesite
// —hoy el mini-chat del glosario— lo consume.
import { createContext, useContext } from "react";

export type Agente = "analizador" | "pronostico";

export const AgenteDocs = createContext<Agente>("analizador");

export function useAgenteDocs(): Agente {
  return useContext(AgenteDocs);
}

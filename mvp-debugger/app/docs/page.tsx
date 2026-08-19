import type { Metadata } from "next";
import { DocsShell } from "./DocsShell";
import { analizadorActivo } from "@/app/lib/agentes";

export const metadata: Metadata = {
  title: "AgroVoltaic · Documentación del sistema",
  description: "Referencia técnica del ecosistema de agentes AgroVoltaic: web, agentes, datos, VisioneFlow y despliegue.",
};

// Render dinamico: el flag de agentes se lee del ENTORNO en cada request. Sin
// esto Next prerenderiza la pagina y congela el valor del momento del build,
// asi que cambiar la variable no cambiaria nada hasta reconstruir.
export const dynamic = "force-dynamic";

export default function DocsPage() {
  // Server component: el flag del entorno baja como prop (ver lib/agentes).
  return <DocsShell analizador={analizadorActivo()} />;
}

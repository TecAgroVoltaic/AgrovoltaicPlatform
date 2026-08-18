import type { Metadata } from "next";
import { DocsShell } from "./DocsShell";

export const metadata: Metadata = {
  title: "AgroVoltaic · Documentación del sistema",
  description: "Referencia técnica del ecosistema de agentes AgroVoltaic: web, agentes, datos, VisioneFlow y despliegue.",
};

export default function DocsPage() {
  return <DocsShell />;
}

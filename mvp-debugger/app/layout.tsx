import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgroVoltaic · Consola de evaluación de agentes",
  description: "Debugger en vivo de los dos agentes: Histórico y Predictivo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

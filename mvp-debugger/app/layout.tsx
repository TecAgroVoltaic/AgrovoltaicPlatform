import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgroVoltaic · Consola de evaluación de agentes",
  description: "Debugger en vivo de los agentes (analizador PV + pronóstico ambiental)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

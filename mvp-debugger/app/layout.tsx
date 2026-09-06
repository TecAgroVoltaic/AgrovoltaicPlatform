import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // El título por defecto es el del sistema de evaluación de datos, que pasó a
  // ser la sección principal. La consola de agentes pone el suyo en su página.
  title: "AgroVoltaic · Sistema de evaluación de datos",
  description:
    "Análisis del histórico fotovoltaico por rango de fechas, y consola de los agentes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AgroVoltaic · Debugger de agentes",
  description: "Debugger en vivo de los agentes (analizador PV + pronóstico ambiental)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            ⚡ AgroVoltaic <span className="muted">· debugger</span>
          </Link>
          <nav className="nav">
            <Link href="/">Panorama</Link>
            <Link href="/analizador">Analizador PV</Link>
            <Link href="/pronostico">Pronóstico</Link>
          </nav>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}

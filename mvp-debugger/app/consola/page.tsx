import type { Metadata } from "next";

import { Console } from "@/app/components/console/Console";
import { historicoActivo } from "@/app/lib/agentes";

// La consola de agentes vivía en `/` y pasó a `/consola` cuando el sistema de
// evaluación de datos se convirtió en la sección principal. Es la MISMA pantalla:
// solo cambió de dirección.
//
// Server component: lee el flag del entorno y lo BAJA como prop. El cliente
// nunca lee process.env, asi hay una sola fuente de verdad (ver lib/agentes).
// Render dinamico: el flag de agentes se lee del ENTORNO en cada request. Sin
// esto Next prerenderiza la pagina y congela el valor del momento del build,
// asi que cambiar la variable no cambiaria nada hasta reconstruir.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Consola de agentes · AgroVoltaic" };

export default function ConsolaPage() {
  return <Console historico={historicoActivo()} />;
}

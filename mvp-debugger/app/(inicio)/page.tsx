// `/`: el chat en modo simple, a pantalla completa y sin barra lateral (contrato
// §7). Vive en su propio grupo de rutas para no heredar el cascarón del modo
// avanzado.
//
// Decide en el servidor, antes de pintar nada, y en este orden:
//  1. Un enlace viejo al tablero (`/?clima=…`, `/?desde=…`) va a `/tablero` con
//     la misma query: antes el tablero vivía acá.
//  2. Con la cookie en `avanzado`, `/` es el tablero.
//  3. Con el agente apagado, un aviso con salida al modo avanzado; nunca un chat
//     que la puerta del proxy va a rechazar.
// Por eso es dinámica: la cookie y el interruptor se leen en cada request.
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";

import pageStyles from "@/app/components/asistente/page.module.css";
import { SimpleChat } from "@/app/components/inicio/SimpleChat";
import { SimpleUnavailable } from "@/app/components/inicio/SimpleUnavailable";
import { MSG_BLOQUEADO, historicoActivo } from "@/app/lib/agentes";
import { readServerMode } from "@/app/lib/modo/serverMode";
import { legacyDashboardHref } from "@/app/lib/navegacion/legacyHome";
import { TABLERO_PATH } from "@/app/lib/navegacion/paths";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "AgroVoltaic" };

// En Android el teclado achica el área visible en vez de taparla: el campo, que
// en el teléfono va al pie, queda siempre a la vista mientras se escribe.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function InicioPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const legacy = legacyDashboardHref(searchParams);
  if (legacy) redirect(legacy);
  if (readServerMode() === "avanzado") redirect(TABLERO_PATH);
  if (!historicoActivo()) return <SimpleUnavailable reason={MSG_BLOQUEADO} />;
  return (
    <Suspense fallback={<p className={pageStyles.loading}>Cargando el asistente…</p>}>
      <SimpleChat />
    </Suspense>
  );
}

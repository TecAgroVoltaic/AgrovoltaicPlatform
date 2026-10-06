// Asistente: chat a pantalla completa con el Agente Histórico.
//
// La página es de servidor y solo pone la cabecera; la conversación es de
// cliente (localStorage, stream) y va dentro de <Suspense> porque lee el rango
// de la URL con `useSearchParams`.
//
// Con el chat apagado (`AGENTE_HISTORICO=off`) se dice acá, antes de que alguien
// escriba una pregunta que la puerta del proxy va a rechazar igual. Por eso es
// dinámica: el interruptor se lee del proceso en cada request, no del build.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AssistantView } from "@/app/components/asistente/AssistantView";
import { findSection } from "@/app/components/analitica/sections";
import { MSG_BLOQUEADO, historicoActivo } from "@/app/lib/agentes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Asistente · AgroVoltaic" };

const SECTION_PATH = "/asistente";

export default function AsistentePage() {
  const section = findSection(SECTION_PATH);
  return (
    <div className="vista">
      <header className="phead">
        <h1>{section?.label ?? "Asistente"}</h1>
        <p>{section?.description}</p>
      </header>
      {historicoActivo() ? (
        <Suspense fallback={<p className="muted small">Cargando el asistente…</p>}>
          <AssistantView />
        </Suspense>
      ) : (
        <div className="banner" role="status">
          {MSG_BLOQUEADO}
        </div>
      )}
    </div>
  );
}

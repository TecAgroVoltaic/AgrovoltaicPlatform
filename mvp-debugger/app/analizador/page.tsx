import { notFound } from "next/navigation";

import { analizadorActivo } from "@/app/lib/agentes";
import { Health } from "@/app/components/Health";
import { Ask } from "@/app/components/Ask";
import { Kpis } from "@/app/components/Kpis";
import { ToolRunner } from "@/app/components/ToolRunner";
import { DataExplorer } from "@/app/components/DataExplorer";
import { Uso } from "@/app/components/Uso";

const EJEMPLOS = [
  "¿Cuál arreglo generó más energía en todo el histórico y cuál fue su Performance Ratio?",
  "¿Cuánta energía generó PV1 en enero de 2026?",
  "¿Qué temperatura promedio tuvo cada arreglo?",
  "Resumen general del sistema.",
  "¿Cuál es la irradiancia media y el índice de claridad (kt*)?",
  "¿Qué datos hay disponibles y desde cuándo?",
  "¿Va a llover mañana?",
];

// Render dinamico: el flag de agentes se lee del ENTORNO en cada request. Sin
// esto Next prerenderiza la pagina y congela el valor del momento del build,
// asi que cambiar la variable no cambiaria nada hasta reconstruir.
export const dynamic = "force-dynamic";

export default function AnalizadorPage() {
  // Herramienta suelta (no enlazada) del agente historico: si esta bloqueado,
  // esta pagina no existe. Si no, quedaria una vista que solo sabe dar 503.
  if (!analizadorActivo()) notFound();
  return (
    <div>
      <h1>🔆 Analizador PV · debugger</h1>
      <Health servicio="analizador" nombre="Analizador (:8010)" />

      <h2>Preguntar al agente</h2>
      <p className="muted small">
        Envía la pregunta al lazo LLM completo y muestra la traza (tools + salidas + respuesta + costo).
      </p>
      <Ask endpoint="/api/analizador/preguntar" ejemplos={EJEMPLOS} />

      <h2>Consumo / costo</h2>
      <p className="muted small">Tokens y USD por consulta (en la traza) y acumulado del agente.</p>
      <Uso servicio="analizador" />

      <h2>KPIs (estado actual, todo el histórico)</h2>
      <p className="muted small">Llama cada tool con período abierto — números para cruzar contra las respuestas.</p>
      <Kpis />

      <h2>Runner manual de tools</h2>
      <p className="muted small">Ejecuta una tool atómica directo (sin LLM) con los params que quieras.</p>
      <ToolRunner />

      <h2>Explorador de datos (en vivo)</h2>
      <p className="muted small">Cobertura, filas crudas y series de todas las relaciones de la Supabase PV.</p>
      <DataExplorer />
    </div>
  );
}

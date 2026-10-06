"use client";
// Cuándo corrió el evaluador por última vez. Sin esto, una lista vacía se lee
// como «todo sano» aunque el evaluador nunca haya corrido: el silencio leído
// como salud que este proyecto ya pagó una vez.
import { useAlertsSummary } from "@/app/components/analitica/alertas/useAlertsData";
import { instanteEnSitio } from "@/app/lib/tiempo";

export function EvaluationNote() {
  const { state } = useAlertsSummary();
  if (state.status === "loading") return null;
  if (state.status !== "ready") {
    return <span>No se pudo saber cuándo se evaluaron las alertas por última vez.</span>;
  }
  const { lastEvaluation } = state.data;
  return lastEvaluation ? (
    <span>Última evaluación: {instanteEnSitio(lastEvaluation)}.</span>
  ) : (
    <span>Sin evaluar todavía: el evaluador de alertas nunca corrió, así que una lista vacía no dice nada.</span>
  );
}

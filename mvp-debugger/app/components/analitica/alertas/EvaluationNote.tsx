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
    <span>El evaluador de alertas todavía no corrió: que no haya alertas no significa nada aún.</span>
  );
}

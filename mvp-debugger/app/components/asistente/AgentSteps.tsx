"use client";
// Los pasos del agente en sus dos formas. Mientras corre: la lista en vivo, un
// renglón por tool con su estado y lo que tardó. Al terminar: una sola línea
// («2 consultas · 0,9 s») que despliega la traza completa.
//
// El detalle (nombres de tools, costo) no va en el cuerpo del chat: quien lee
// quiere la respuesta, y quien audita la tiene a un clic en la traza.
import { useState } from "react";

import { IconCheck, IconChevronRight, IconFailed, IconSpinner } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/asistente.module.css";
import { TrazaLegible } from "@/app/components/TrazaLegible";
import type { ChatResult } from "@/app/lib/asistente/contracts/chatEvents";
import { formatSeconds, liveStepDurations, stepsSummary } from "@/app/lib/asistente/presentation";
import type { LiveStep, TurnProgress } from "@/app/lib/asistente/turnReducer";

const STEP_ICON_SIZE = 14;
const TOGGLE_ICON_SIZE = 12;
const STEP_ICON_STROKE = 2.4;

export function LiveStepList({ progress }: { progress: TurnProgress }) {
  const durations = liveStepDurations(progress.liveSteps, progress.steps);
  return (
    <ol className={styles.liveSteps} aria-label="Pasos del asistente" aria-live="polite">
      {progress.liveSteps.map((step) => (
        <LiveStepItem key={step.id} step={step} durationMs={durations.get(step.id)} />
      ))}
    </ol>
  );
}

const STATUS_CLASS: Readonly<Record<LiveStep["status"], string>> = {
  running: styles.stepRunning,
  done: styles.stepDone,
  failed: styles.stepFailed,
};

function LiveStepItem({ step, durationMs }: { step: LiveStep; durationMs: number | undefined }) {
  const Icon = step.status === "running" ? IconSpinner : step.status === "done" ? IconCheck : IconFailed;
  return (
    <li className={`${styles.step} ${STATUS_CLASS[step.status]}`}>
      <Icon size={STEP_ICON_SIZE} strokeWidth={STEP_ICON_STROKE} />
      <span>
        {step.label}
        {step.status === "running" ? "…" : step.status === "failed" ? " (falló)" : ""}
      </span>
      {durationMs !== undefined ? <span className={styles.stepTime}>{formatSeconds(durationMs)}</span> : null}
    </li>
  );
}

/** La línea plegada de una respuesta terminada, que despliega su traza. */
export function StepsDisclosure({ trace }: { trace: ChatResult }) {
  const [open, setOpen] = useState(false);
  const cost = trace.costo?.usd_total ?? null;
  return (
    <>
      <button
        type="button"
        className={styles.stepsToggle}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <IconChevronRight size={TOGGLE_ICON_SIZE} strokeWidth={2} />
        <span>{stepsSummary(trace.pasos, trace.ms_total)}</span>
      </button>
      {open ? (
        <div className="chat-traza">
          <TrazaLegible pasos={[...trace.pasos]} usage={trace.usage} ms={trace.ms_total ?? null} costo={cost} />
        </div>
      ) : null}
    </>
  );
}

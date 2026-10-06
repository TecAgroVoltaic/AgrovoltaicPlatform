// El estado de UNA respuesta del asistente mientras llega por el stream.
//
// Es una función pura (estado, evento) -> estado, así que se prueba con una
// lista de eventos y nada más. La vista la aplica evento a evento para pintar en
// vivo, y el hook la reutiliza para saber qué guardar al terminar.
import type { AgentStep, ChatResult } from "@/app/lib/asistente/contracts/chatEvents";
import type { ChatFailure, ChatStreamEvent } from "@/app/lib/asistente/stream";
import { toolProgressLabel } from "@/app/lib/asistente/toolLabels";

export type LiveStepStatus = "running" | "done" | "failed";

/** Una tool tal como se ve en la lista de pasos en vivo. */
export type LiveStep = {
  readonly id: string;
  readonly toolName: string;
  readonly label: string;
  readonly status: LiveStepStatus;
};

export type TurnProgress = {
  readonly model: string | null;
  readonly liveSteps: readonly LiveStep[];
  /** Los pasos cerrados, en orden: de acá salen los gráficos y las descargas. */
  readonly steps: readonly AgentStep[];
  /** Texto que está llegando y todavía no cerró en un paso del modelo. */
  readonly streamingText: string;
};

export type TurnState =
  | { readonly status: "idle" }
  | { readonly status: "streaming"; readonly progress: TurnProgress }
  | { readonly status: "done"; readonly progress: TurnProgress; readonly result: ChatResult }
  | { readonly status: "failed"; readonly progress: TurnProgress; readonly failure: ChatFailure }
  | { readonly status: "cancelled"; readonly progress: TurnProgress };

export const IDLE_TURN: TurnState = { status: "idle" };

const EMPTY_PROGRESS: TurnProgress = { model: null, liveSteps: [], steps: [], streamingText: "" };

export function beginTurn(): TurnState {
  return { status: "streaming", progress: EMPTY_PROGRESS };
}

export function turnReducer(state: TurnState, event: ChatStreamEvent): TurnState {
  // Un evento que llega después del desenlace (o sin turno abierto) no cambia
  // nada: lo que ya se resolvió no se reabre.
  if (state.status !== "streaming") return state;
  const { progress } = state;

  switch (event.type) {
    case "start":
      return streaming({ ...progress, model: event.model });
    case "toolStart":
      return streaming({
        ...progress,
        liveSteps: [
          ...progress.liveSteps,
          { id: event.id, toolName: event.name, label: toolProgressLabel(event.name), status: "running" },
        ],
      });
    case "step":
      return streaming(applyStep(progress, event.step));
    case "textDelta":
      return streaming({ ...progress, streamingText: progress.streamingText + event.delta });
    case "done":
      // `fin` es la versión autoritativa: sus pasos y su `respuesta` reemplazan
      // lo que se armó con los deltas (que traen también el texto intermedio de
      // los turnos que terminaron pidiendo una tool).
      return {
        status: "done",
        progress: { ...progress, steps: event.result.pasos, streamingText: event.result.respuesta },
        result: event.result,
      };
    case "failure":
      return { status: "failed", progress: settleRunning(progress), failure: event.failure };
    case "cancelled":
      return { status: "cancelled", progress: settleRunning(progress) };
  }
}

function streaming(progress: TurnProgress): TurnState {
  return { status: "streaming", progress };
}

function applyStep(progress: TurnProgress, step: AgentStep): TurnProgress {
  const steps = [...progress.steps, step];
  // El paso del modelo cierra su turno y trae el texto entero que venía
  // llegando por deltas: si el buffer no se vacía, la vista lo pintaría dos
  // veces. Si el turno terminó pidiendo una tool (`stop_reason: tool_use`), ese
  // texto era intermedio: queda como un bloque más del progreso, en su lugar,
  // y la respuesta final sale de `fin.respuesta`.
  if (step.tipo === "modelo") return { ...progress, steps, streamingText: "" };
  if (step.tipo !== "tool") return { ...progress, steps };

  // El paso de una tool no trae el id de su `tool_inicio`: se empareja con la
  // primera del mismo nombre que sigue corriendo, que es el orden en que el
  // backend las ejecuta.
  const index = progress.liveSteps.findIndex(
    (live) => live.status === "running" && live.toolName === step.nombre,
  );
  if (index < 0) return { ...progress, steps };
  const liveSteps = progress.liveSteps.map((live, position) =>
    position === index ? { ...live, status: step.error ? "failed" : "done" } satisfies LiveStep : live,
  );
  return { ...progress, steps, liveSteps };
}

/** Al cortar, lo que seguía corriendo no terminó bien: no puede quedar con su
 * indicador girando en una respuesta que ya se cerró. */
function settleRunning(progress: TurnProgress): TurnProgress {
  return {
    ...progress,
    liveSteps: progress.liveSteps.map((live) =>
      live.status === "running" ? { ...live, status: "failed" } : live,
    ),
  };
}

// Traduce UNA respuesta de Flow, evento por evento, a los eventos de la consola.
//
// Tiene estado porque `fin` tiene que traer todos los pasos (el reducer de la
// consola los toma de ahí como versión autoritativa) y Flow no los acumula: solo
// avisa cada token y cada tool. El texto que el modelo escribió antes de pedir
// una tool se cierra como un paso del modelo, igual que hace el backend, para
// que quede en su lugar entre los gráficos y no se pinte dos veces.
import type { ZodType } from "zod";

import {
  FLOW_ERROR_CODE,
  errorEvent,
  type ConsoleEvent,
  type FlowErrorCode,
} from "@/app/lib/asistente/flow/consoleEvents";
import {
  FLOW_EVENT,
  completeEventSchema,
  nodeErrorEventSchema,
  responseTextOf,
  tokenEventSchema,
  toolCallEventSchema,
  toolResultEventSchema,
  type CompleteEvent,
  type ToolCallEvent,
} from "@/app/lib/asistente/flow/flowEvents";
import { toolStepFrom } from "@/app/lib/asistente/flow/toolStep";
import type { SseFrame } from "@/app/lib/asistente/sse";

const TOOL_ID_PREFIX = "flow-tool-";

export type FlowFailureLog = (code: FlowErrorCode, detail: unknown) => void;

export class FlowTurnTranslator {
  private readonly steps: Readonly<Record<string, unknown>>[] = [];
  private pendingText = "";
  private toolCount = 0;
  private finishedTurn = false;

  constructor(
    private readonly model: string,
    private readonly logFailure: FlowFailureLog,
  ) {}

  /** Ya salió `fin` o `error`: no hay nada más que traducir. */
  get finished(): boolean {
    return this.finishedTurn;
  }

  start(): ConsoleEvent {
    return { name: "inicio", data: { modelo: this.model } };
  }

  translate(frame: SseFrame): ConsoleEvent[] {
    if (this.finishedTurn) return [];
    switch (frame.event) {
      case FLOW_EVENT.token:
        return this.decode(frame, tokenEventSchema, ({ content }) => this.onToken(content));
      case FLOW_EVENT.toolCall:
        return this.decode(frame, toolCallEventSchema, (call) => this.onToolCall(call));
      case FLOW_EVENT.toolResult:
        return this.decode(frame, toolResultEventSchema, (result) => {
          const step = toolStepFrom(result);
          this.steps.push(step);
          return [{ name: "paso", data: step }];
        });
      case FLOW_EVENT.complete:
        return this.decode(frame, completeEventSchema, (complete) => this.onComplete(complete));
      case FLOW_EVENT.nodeError:
        return this.decode(frame, nodeErrorEventSchema, (nodeError) =>
          this.fail(FLOW_ERROR_CODE.nodeFailed, nodeError),
        );
      default:
        return [];
    }
  }

  private onToken(content: string): ConsoleEvent[] {
    if (!content) return [];
    this.pendingText += content;
    return [{ name: "texto", data: { delta: content } }];
  }

  private onToolCall(call: ToolCallEvent): ConsoleEvent[] {
    const events: ConsoleEvent[] = [];
    const intermediateText = this.takePendingText();
    if (intermediateText) {
      const modelStep = { tipo: "modelo", texto: intermediateText, solicita: [{ nombre: call.toolName, input: call.input }] };
      this.steps.push(modelStep);
      events.push({ name: "paso", data: modelStep });
    }
    this.toolCount += 1;
    events.push({
      name: "tool_inicio",
      data: { id: `${TOOL_ID_PREFIX}${this.toolCount}`, nombre: call.toolName, input: call.input },
    });
    return events;
  }

  private onComplete(complete: CompleteEvent): ConsoleEvent[] {
    if (!complete.success) return this.fail(FLOW_ERROR_CODE.flowFailed, complete.error);
    const streamedText = this.takePendingText();
    const answer = responseTextOf(complete.output) ?? streamedText;
    if (answer.trim()) this.steps.push({ tipo: "modelo", texto: answer, solicita: [] });
    this.finishedTurn = true;
    return [
      {
        name: "fin",
        data: {
          respuesta: answer,
          modelo: this.model,
          pasos: this.steps,
          usage: complete.tokensUsed === undefined ? {} : { tokens_totales: complete.tokensUsed },
          ...(complete.totalDuration === undefined ? {} : { ms_total: complete.totalDuration }),
        },
      },
    ];
  }

  private fail(code: FlowErrorCode, detail: unknown): ConsoleEvent[] {
    this.logFailure(code, detail);
    this.finishedTurn = true;
    return [errorEvent(code)];
  }

  private takePendingText(): string {
    const text = this.pendingText;
    this.pendingText = "";
    return text;
  }

  private decode<TData>(
    frame: SseFrame,
    schema: ZodType<TData>,
    translate: (data: TData) => ConsoleEvent[],
  ): ConsoleEvent[] {
    let json: unknown;
    try {
      json = JSON.parse(frame.data);
    } catch (error) {
      return this.fail(FLOW_ERROR_CODE.malformedEvent, { evento: frame.event, error });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) return this.fail(FLOW_ERROR_CODE.malformedEvent, { evento: frame.event, issues: parsed.error.issues });
    return translate(parsed.data);
  }
}

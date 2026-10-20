// Qué motor responde el chat del asistente. SOLO servidor: lo decide la ruta
// `/api/asistente/chat` y el navegador nunca sabe a qué servicio se habla.
//
//   ASISTENTE_MOTOR=plataforma (o ausente) -> backend del Agente Histórico (/chat/stream)
//   ASISTENTE_MOTOR=flow                    -> agente de Visione Flow (canal web)
//
// La cookie `av_motor` pisa la variable para una sesión: sirve para probar Flow
// sin cambiárselo a nadie más, y volver atrás es borrar la cookie. Un valor
// desconocido (de la variable o de la cookie) cae en `plataforma`: un error de
// tipeo deja el motor que ya funciona, no una pantalla rota.
export const ENV_ENGINE = "ASISTENTE_MOTOR";
export const ENGINE_COOKIE = "av_motor";

export const CHAT_ENGINES = ["plataforma", "flow"] as const;
export type ChatEngine = (typeof CHAT_ENGINES)[number];

export const DEFAULT_ENGINE: ChatEngine = "plataforma";

export function resolveEngine(cookieValue: string | undefined): ChatEngine {
  return parseEngine(cookieValue) ?? parseEngine(process.env[ENV_ENGINE]) ?? DEFAULT_ENGINE;
}

function parseEngine(value: string | undefined): ChatEngine | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return CHAT_ENGINES.find((engine) => engine === normalized) ?? null;
}

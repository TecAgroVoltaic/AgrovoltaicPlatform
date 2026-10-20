// Configuración del motor Flow. SOLO servidor, como `app/lib/config.ts`: la URL
// del webhook y su clave nunca se serializan al navegador.
export const ENV_FLOW_URL = "FLOW_WEBHOOK_URL";
export const ENV_FLOW_KEY = "FLOW_WEBHOOK_KEY";

/** Lo que muestra la traza como «modelo»: Flow no dice cuál usó su agente. */
export const FLOW_MODEL_LABEL = "visione-flow";

export type FlowConfig = { readonly url: string; readonly key: string };

export type FlowConfigRead =
  | { readonly ok: true; readonly config: FlowConfig }
  | { readonly ok: false; readonly missing: string };

/** La clave es obligatoria: el webhook web de Flow es público, y sin ella
 *  cualquiera con la URL gastaría tokens del agente. Falla cerrado. */
export function readFlowConfig(): FlowConfigRead {
  const url = process.env[ENV_FLOW_URL]?.trim();
  const key = process.env[ENV_FLOW_KEY]?.trim();
  if (!url) return { ok: false, missing: ENV_FLOW_URL };
  if (!key) return { ok: false, missing: ENV_FLOW_KEY };
  return { ok: true, config: { url, key } };
}

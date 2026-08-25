// Configuracion SOLO servidor (se importa unicamente en route handlers).
// Las API keys viven aca y nunca se serializan al cliente: el browser habla con
// /api/*, y esas rutas inyectan la key al llamar al servicio Python.
//
// DOS agentes, dos servicios. No hay mas.

export type Servicio = { url: string; key?: string };

/** Agente Historico: analisis y calidad del historico PV (paquete `historico`). */
export const HISTORICO: Servicio = {
  url: process.env.HISTORICO_URL || "http://127.0.0.1:8010",
  key: process.env.HISTORICO_API_KEY || undefined,
};

/** Agente Predictivo: irradiancia y humedad de suelo (paquete `predictivo`). */
export const PREDICTIVO: Servicio = {
  url: process.env.PREDICTIVO_URL || "http://127.0.0.1:8000",
  key: process.env.PREDICTIVO_API_KEY || undefined,
};

// Configuracion SOLO servidor (se importa unicamente en route handlers).
// Las API keys viven aca y nunca se serializan al cliente: el browser habla con
// /api/*, y esas rutas inyectan la key al llamar al servicio Python.

export type Servicio = { url: string; key?: string };

// El proyecto de Vercel (agrovoltaic-consola) nombra los servicios por su rol:
// HISTORICO_* = analizador, PREDICTIVO_* = pronostico. Se aceptan ambos nombres
// para no tener que rotar secretos al renombrar codigo.
export const ANALIZADOR: Servicio = {
  url: process.env.ANALIZADOR_URL || process.env.HISTORICO_URL || "http://127.0.0.1:8010",
  key: process.env.ANALIZADOR_API_KEY || process.env.HISTORICO_API_KEY || undefined,
};

export const PRONOSTICO: Servicio = {
  url: process.env.PRONOSTICO_URL || process.env.PREDICTIVO_URL || "http://127.0.0.1:8000",
  key: process.env.PRONOSTICO_API_KEY || process.env.PREDICTIVO_API_KEY || undefined,
};

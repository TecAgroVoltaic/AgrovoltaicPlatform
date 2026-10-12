// El navegador nunca habla con el servicio histórico: pasa por la ruta API de
// Next (`app/api/historico/[...path]`), que agrega la clave del lado servidor.
// Las rutas de los specs del asistente son relativas al servicio.

export const HISTORICO_PROXY = "/api/historico";

/** La ruta del servicio (`/datos/exportar?…`) vista desde el navegador. */
export function throughHistoricoProxy(serviceRoute: string): string {
  return `${HISTORICO_PROXY}${serviceRoute}`;
}

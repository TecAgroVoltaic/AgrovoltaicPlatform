// Lee el modo en el servidor. Separado de `mode.ts` porque `next/headers` solo
// existe del lado del servidor y ese módulo lo importan componentes de cliente.
import { cookies } from "next/headers";

import { MODE_COOKIE, parseMode, type Mode } from "@/app/lib/modo/mode";

export function readServerMode(): Mode {
  return parseMode(cookies().get(MODE_COOKIE)?.value);
}

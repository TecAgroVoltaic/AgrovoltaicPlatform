// Trae el catálogo de variables EN EL SERVIDOR, antes del primer pintado.
//
// Se hace acá y no en el navegador por una razón de secuencia: el selector y la
// decisión de si una variable tiene sentido en este rango dependen del catálogo,
// así que pedirlo desde el cliente encadenaría catálogo -> serie, que es la
// cascada que hay que evitar. Resuelto en el servidor, las dos peticiones del
// navegador (completitud y serie) salen a la vez y con el catálogo ya en mano.
//
// IMPORTA `app/lib/config`, que es SOLO SERVIDOR (ahí viven las API keys). Este
// módulo no se puede importar desde un componente de cliente.
import { HISTORICO } from "@/app/lib/config";
import { variableCatalogSchema, type VariableCatalog } from "@/app/lib/analitica/contracts/variables";

const CATALOG_PATH = "/analitica/variables";
const TIMEOUT_MS = 10_000;

export type CatalogLoad =
  | { readonly status: "ready"; readonly catalog: VariableCatalog }
  /** `message` ya está redactado para la pantalla, en castellano. */
  | { readonly status: "failed"; readonly message: string };

/** Nunca lanza: un catálogo que no llega deja la vista coja, no rota. La
 *  completitud del período no depende de él y tiene que seguir viéndose. */
export async function loadVariableCatalog(): Promise<CatalogLoad> {
  try {
    const response = await fetch(`${HISTORICO.url}${CATALOG_PATH}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: HISTORICO.key ? { "x-api-key": HISTORICO.key } : {},
    });
    if (!response.ok) {
      return { status: "failed", message: `el servicio respondió ${response.status}` };
    }
    const parsed = variableCatalogSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { status: "failed", message: "el catálogo de variables no tiene la forma esperada" };
    }
    return { status: "ready", catalog: parsed.data };
  } catch (error) {
    return { status: "failed", message: describe(error) };
  }
}

function describe(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "el catálogo de variables tardó demasiado en responder";
  }
  return "no se pudo contactar al servicio de análisis";
}

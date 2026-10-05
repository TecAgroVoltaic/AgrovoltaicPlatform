// De dónde se baja el catálogo de variables (`GET /analitica/variables`), que es
// la fuente de la cobertura por variable que interpreta `coverage.ts`.
//
// Vive aparte de `coverage.ts` por dos razones y no por el largo: acá hay
// TRANSPORTE (una petición, sus fallos y sus tiempos) y allá CONOCIMIENTO (qué
// cubre cada variable). Y `coverage.ts` lo importan componentes de cliente que
// solo quieren el rango por defecto: no tienen por qué arrastrar un `fetch`.
//
// El catálogo es METADATO: no viaja en el sobre de `resultado`, así que no hay
// `ventana` ni `confianza` que leer y no usa `analysisResponse`.
import {
  variableCatalogSchema,
  type VariableCatalog,
} from "@/app/lib/analitica/contracts/variables";
import { failure, type AnalyticsFailure, type AnalyticsResult } from "@/app/lib/analitica/errors";

const CATALOG_PATH = "/analitica/variables";
const CATALOG_TIMEOUT_MS = 10_000;
const UNAUTHORIZED_STATUS = 401;

/** Firma mínima de `fetch`, inyectable para probar sin red (DIP). */
export type CatalogFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type CatalogSource = {
  /** Base del servicio, SIN barra final. Va explícita y sin valor por defecto a
   *  propósito: el catálogo conviene pedirlo desde el SERVIDOR (`HISTORICO.url`),
   *  porque el selector y la decisión de si una variable tiene sentido en el
   *  rango dependen de él, y pedirlo desde el navegador encadena catálogo y
   *  serie, que es justo la cascada a evitar. Desde el navegador, si alguna vez
   *  hiciera falta, es la ruta del proxy `/api/historico` (la API key se inyecta
   *  del lado servidor y el browser no la ve nunca). */
  readonly baseUrl: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly httpFetch?: CatalogFetch;
};

/**
 * Baja el catálogo de variables. NUNCA lanza: sin catálogo la vista queda coja
 * (sin selector), no rota, y lo que no depende de él sigue siendo válido.
 *
 * @returns `ok: true` con el catálogo ya validado, o el fallo con su código.
 */
export async function fetchVariableCatalog(
  source: CatalogSource,
): Promise<AnalyticsResult<VariableCatalog>> {
  const httpFetch = source.httpFetch ?? globalThis.fetch;
  try {
    const response = await httpFetch(`${source.baseUrl}${CATALOG_PATH}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
      headers: source.headers ?? {},
    });
    if (!response.ok) {
      const code = response.status === UNAUTHORIZED_STATUS ? "UNAUTHORIZED" : "UPSTREAM_ERROR";
      return { ok: false, failure: failure(code, { status: response.status }) };
    }
    // Un cuerpo que no es JSON y uno que no cumple el contrato son el mismo
    // fallo, y ninguno se pierde: los dos salen como MALFORMED_RESPONSE.
    const body: unknown = await response.json().catch(() => null);
    const parsed = variableCatalogSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, failure: failure("MALFORMED_RESPONSE", { detail: parsed.error.message }) };
    }
    return { ok: true, data: parsed.data };
  } catch (error) {
    return { ok: false, failure: transportFailure(error) };
  }
}

function transportFailure(error: unknown): AnalyticsFailure {
  if (error instanceof Error && error.name === "TimeoutError") return failure("TIMEOUT");
  return failure("NETWORK", { detail: error instanceof Error ? error.message : String(error) });
}

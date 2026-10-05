// Vocabulario compartido por los contratos de calidad: gravedad y veredicto de
// un día. Vive aparte del barril A PROPÓSITO: si los esquemas por endpoint lo
// importaran de `calidad.ts`, que a su vez los reexporta, el ciclo dejaría
// `severitySchema` sin inicializar en tiempo de carga y Zod fallaría con un
// "expected a Zod schema" que no apunta a ninguna parte.
import { z } from "zod";

/** Gravedad de un hallazgo, de mayor a menor. */
export type Severity = "critical" | "warning" | "info";

/** De más a menos grave. Es también el orden en que se pinta todo. */
export const SEVERITY_ORDER: readonly Severity[] = ["critical", "warning", "info"];

const SEVERITY_WIRE = { grave: "critical", aviso: "warning", info: "info" } as const;
const WIRE_BY_SEVERITY = { critical: "grave", warning: "aviso", info: "info" } as const;

/** Valor que el backend espera en `?severidad=`. */
export function severityToWire(severity: Severity): string {
  return WIRE_BY_SEVERITY[severity];
}

export const severitySchema = z
  .enum(["grave", "aviso", "info"])
  .transform((wire) => SEVERITY_WIRE[wire]);

/** Veredicto de un día. No comparte tipo con `Severity` porque el backend no
 * emite días "informativos" y sí emite dos estados que una gravedad no tiene:
 * `ok` (evaluado y aprobado) y `noData`, que NO es un aprobado sino una ausencia. */
export type DayVerdict = "ok" | "warning" | "critical" | "noData";

const DAY_VERDICT_WIRE = {
  ok: "ok", aviso: "warning", grave: "critical", sin_datos: "noData",
} as const;

export const dayVerdictSchema = z
  .enum(["ok", "aviso", "grave", "sin_datos"])
  .transform((wire): DayVerdict => DAY_VERDICT_WIRE[wire]);

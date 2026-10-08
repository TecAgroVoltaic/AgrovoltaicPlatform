import type { ZodError } from "zod";

/** El primer problema de una validación, con la ruta del campo. Uno solo y no
 * la lista: lo lee una persona en la tarjeta, no un desarrollador en la consola. */
export function describeFirstIssue(error: ZodError): string {
  const [issue] = error.issues;
  if (!issue) return "forma desconocida";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

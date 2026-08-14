// Sesion firmada para el gate de acceso. Responsabilidad unica: emitir y
// verificar el valor de la cookie; no decide a QUE rutas se aplica (eso es del
// middleware) ni renderiza nada.
//
// Usa Web Crypto (crypto.subtle), NO el modulo `crypto` de Node: el middleware
// de Next corre en el runtime Edge, donde los modulos de Node no existen.
//
// La cookie NO guarda datos del usuario: es `<expiracion>.<hmac>`. El servidor
// no necesita estado — si la firma valida y no vencio, la sesion es buena.

const CODIFICADOR = new TextEncoder();

export const COOKIE_SESION = "agrovoltaic_sesion";
export const ENV_PASSWORD = "DEBUGGER_PASSWORD";
export const ENV_SECRETO = "DEBUGGER_SESSION_SECRET";

// Duracion de la sesion. Es una consola de depuracion de uso puntual: 12 h
// cubre una jornada de trabajo sin dejar sesiones abiertas indefinidamente.
export const DURACION_SESION_SEG = 12 * 60 * 60;

/** Password esperada. Sin ella configurada no hay gate posible. */
export function passwordConfigurada(): string | undefined {
  return process.env[ENV_PASSWORD] || undefined;
}

/** Secreto de firma. Cae al password si no se definio uno aparte. */
function secretoFirma(): string {
  return process.env[ENV_SECRETO] || passwordConfigurada() || "";
}

async function firmar(mensaje: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    CODIFICADOR.encode(secretoFirma()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, CODIFICADOR.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparacion en tiempo constante: no filtra la firma por timing. */
function igualdadConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/** Valor de cookie para una sesion que arranca ahora. */
export async function crearSesion(): Promise<string> {
  const expiracion = Math.floor(Date.now() / 1000) + DURACION_SESION_SEG;
  return `${expiracion}.${await firmar(String(expiracion))}`;
}

/** true si la cookie tiene firma valida y no vencio. */
export async function sesionValida(valor: string | undefined): Promise<boolean> {
  if (!valor) return false;
  const [expiracion, firma] = valor.split(".");
  if (!expiracion || !firma) return false;
  if (Number(expiracion) <= Math.floor(Date.now() / 1000)) return false;
  return igualdadConstante(firma, await firmar(expiracion));
}

/** true si la password enviada en el login es la correcta. */
export async function passwordCorrecta(enviada: string): Promise<boolean> {
  const esperada = passwordConfigurada();
  if (!esperada) return false;
  // Se comparan los HMAC y no los strings: iguala la longitud y evita filtrar
  // el largo de la password real.
  return igualdadConstante(await firmar(enviada), await firmar(esperada));
}

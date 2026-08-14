// Freno de intentos de login por IP. Responsabilidad unica: decir si una IP
// puede intentar de nuevo; no valida la password ni emite la sesion.
//
// Por que existe: el gate protege contra "cualquiera con la URL entra", pero sin
// limite de intentos una password se rompe por fuerza bruta. En una red interna
// da igual; expuesto a internet, no.
//
// LIMITACION HONESTA: el estado es EN MEMORIA del proceso. En un hosting
// serverless (Amplify, Vercel) cada instancia lleva su propia cuenta y un
// reciclado la borra, asi que esto sube el costo del ataque pero no lo elimina.
// La defensa que NO depende del proceso es el costo por intento (PBKDF2 en
// auth.ts): ahi cada prueba cuesta CPU, la recicle quien la recicle.

const VENTANA_MS = 15 * 60 * 1000;   // ventana en la que se cuentan los intentos
const MAX_INTENTOS = 8;              // holgado para un dedo torpe, inútil para un bot
const BLOQUEO_MS = 15 * 60 * 1000;   // cuánto se rechaza a una IP que se pasó
const MAX_IPS = 5000;                // techo del mapa: no crecer sin fin

type Registro = { intentos: number; desde: number; bloqueadaHasta: number };

const porIp = new Map<string, Registro>();

function limpiar(ahora: number): void {
  for (const [ip, r] of porIp) {
    if (r.bloqueadaHasta < ahora && ahora - r.desde > VENTANA_MS) porIp.delete(ip);
  }
  // Si aun asi crecio demasiado (muchas IPs distintas a la vez), se descarta lo
  // mas viejo: preferible perder precision que quedarse sin memoria.
  if (porIp.size > MAX_IPS) {
    const orden = [...porIp.entries()].sort((a, b) => a[1].desde - b[1].desde);
    for (const [ip] of orden.slice(0, porIp.size - MAX_IPS)) porIp.delete(ip);
  }
}

/** Segundos que faltan para poder reintentar; 0 si puede intentar ahora. */
export function esperaRestante(ip: string, ahora = Date.now()): number {
  const r = porIp.get(ip);
  if (!r || r.bloqueadaHasta <= ahora) return 0;
  return Math.ceil((r.bloqueadaHasta - ahora) / 1000);
}

/** Registra un intento fallido y bloquea la IP si se pasó del máximo. */
export function registrarFallo(ip: string, ahora = Date.now()): void {
  limpiar(ahora);
  const r = porIp.get(ip);
  if (!r || ahora - r.desde > VENTANA_MS) {
    porIp.set(ip, { intentos: 1, desde: ahora, bloqueadaHasta: 0 });
    return;
  }
  r.intentos += 1;
  if (r.intentos >= MAX_INTENTOS) r.bloqueadaHasta = ahora + BLOQUEO_MS;
}

/** Un login exitoso limpia el historial de esa IP. */
export function registrarExito(ip: string): void {
  porIp.delete(ip);
}

/** IP del cliente detrás de un proxy (Amplify, nginx) o directa. */
export function ipDe(req: Request): string {
  const reenviada = req.headers.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconocida";
}

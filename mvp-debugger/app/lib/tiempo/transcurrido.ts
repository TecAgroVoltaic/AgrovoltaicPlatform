// 4. Tiempo transcurrido entre dos instantes. Es una resta, no depende de zona.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/** Cuánto pasó entre dos instantes, en la unidad más grande que cabe entera:
 *  «hace 8 s», «hace 12 min», «hace 2 h», «hace 3 d». Un `since` en el futuro
 *  (relojes desfasados entre servidor y navegador) se lee como «hace 0 s». */
export function elapsedSince(since: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - since.getTime()) / MS_PER_SECOND));
  if (seconds < SECONDS_PER_MINUTE) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / HOURS_PER_DAY)} d`;
}

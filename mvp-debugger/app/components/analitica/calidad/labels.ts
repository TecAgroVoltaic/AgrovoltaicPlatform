// Las palabras y las tramas de la vista, en un solo sitio.
//
// Cada estado se define con TRES señales redundantes: una palabra, un signo
// tipográfico y una clase con su trama. El color es la cuarta y nunca la única,
// así que la pantalla se sigue leyendo sin distinguir rojo de verde.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import type { DayVerdict, Severity } from "@/app/lib/analitica/contracts/calidad";

export type StateBadge = {
  readonly label: string;
  readonly glyph: string;
  /** Clase con la trama; la del cascarón (`sev-*`) aporta solo el color. */
  readonly patternClass: string;
  readonly meaning: string;
};

export const SEVERITY_BADGE: Readonly<Record<Severity, StateBadge>> = {
  critical: {
    label: "Grave",
    glyph: "▲",
    patternClass: `${styles.cell} ${styles.crit}`,
    meaning: "compromete el día: el dato de esa variable no se puede usar",
  },
  warning: {
    label: "Aviso",
    glyph: "■",
    patternClass: `${styles.cell} ${styles.warn}`,
    meaning: "hay que mirarlo, pero el día sigue siendo utilizable",
  },
  info: {
    label: "Informativo",
    glyph: "○",
    patternClass: `${styles.cell} ${styles.ok}`,
    meaning: "queda anotado para trazabilidad; no cambia el veredicto",
  },
};

/** Clase del cascarón que pone el color de cada gravedad. */
export const SEVERITY_INK: Readonly<Record<Severity, string>> = {
  critical: "sev-grave",
  warning: "sev-aviso",
  info: "sev-info",
};

export const DAY_VERDICT_BADGE: Readonly<Record<DayVerdict, StateBadge>> = {
  critical: {
    label: "Grave",
    glyph: "▲",
    patternClass: `${styles.cell} ${styles.crit}`,
    meaning: "día evaluado con al menos un problema grave y material",
  },
  warning: {
    label: "Aviso",
    glyph: "■",
    patternClass: `${styles.cell} ${styles.warn}`,
    meaning: "día evaluado con avisos, sin nada grave",
  },
  ok: {
    label: "Sin hallazgos",
    glyph: "●",
    patternClass: `${styles.cell} ${styles.ok}`,
    meaning: "día evaluado y aprobado por las pruebas que sí lo miran",
  },
  noData: {
    label: "Ausente",
    glyph: "·",
    patternClass: `${styles.cell} ${styles.noData}`,
    meaning: "ni una sola fila ese día: no está limpio, está ausente",
  },
};

/** El otro eje: qué hizo el EQUIPO, que no es qué tan bueno es el dato. */
export type PlantState = "running" | "stopped" | "stoppedUnderSun" | "noData";

export const PLANT_STATE_BADGE: Readonly<Record<PlantState, StateBadge>> = {
  running: {
    label: "Acoplado",
    glyph: "●",
    patternClass: `${styles.cell} ${styles.running}`,
    meaning: "el inversor estuvo acoplado a la red en horario operativo",
  },
  stopped: {
    label: "Parado",
    glyph: "■",
    patternClass: `${styles.cell} ${styles.stopped}`,
    meaning: "parado entre las 07:00 y las 17:00, sin sol pleno detrás",
  },
  stoppedUnderSun: {
    label: "Parado con sol",
    glyph: "▲",
    patternClass: `${styles.cell} ${styles.stoppedSun}`,
    meaning: "parado con sol pleno: avería que revisar, no dato malo",
  },
  noData: {
    label: "Ausente",
    glyph: "·",
    patternClass: `${styles.cell} ${styles.noData}`,
    meaning: "sin datos: no se puede decir qué hizo el equipo",
  },
};

/** El estado del equipo de un día, derivado de las banderas que manda el backend. */
export function plantStateOf(day: {
  readonly verdict: DayVerdict;
  readonly plantStopped: boolean;
  readonly stoppedUnderSun: boolean;
}): PlantState {
  if (day.verdict === "noData") return "noData";
  if (day.stoppedUnderSun) return "stoppedUnderSun";
  return day.plantStopped ? "stopped" : "running";
}

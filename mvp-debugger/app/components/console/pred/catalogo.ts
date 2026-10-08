import { moverDias } from "@/app/lib/tiempo";

export const VARIABLES: [string, string][] = [
  ["irradiancia", "Irradiancia"], ["humedad_suelo", "Humedad de suelo"],
];
// La anticipación ES la resolución del backtest: reconstruir un bucket = predecir
// ese bucket con el anterior. Que sean el mismo control evita el desfase entre
// "lo que veo" y "lo que se predijo".
export const ANTICIPACIONES: [string, string][] = [
  ["15min", "15 min"], ["30min", "30 min"], ["h", "1 hora"],
];
// La anticipación en segundos, para pedírsela al agente sin que tenga que
// deducirla del texto (`predecir` la exige como entero).
export const SEGUNDOS: Record<string, number> = { "15min": 900, "30min": 1800, h: 3600 };

export const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR",
    { minimumFractionDigits: d, maximumFractionDigits: d });

export const diaSiguiente = (f: string) => moverDias(f, 1);

export const etiqueta = (s: string) => ANTICIPACIONES.find(([b]) => b === s)?.[1] || s;

/** «HH:MM» de una marca ISO local. */
export const HORA_EN_ISO = [11, 16] as const;
export const LARGO_FECHA_ISO = 10;

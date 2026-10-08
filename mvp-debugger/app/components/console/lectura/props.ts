import type { IdModo } from "@/app/components/console/modos";

/** Qué revelar después de que el agente se comprometió. */
export type Revelar = { variable: string; ahora: string; horizonte_seg: number;
                        unidad: string; dec?: number };

export type LecturaAgenteProps = {
  pregunta: string;
  contexto: string;
  /** Valores que dibuja el gráfico, para la verificación cruzada. */
  esperado?: { real: number; pred: number } | null;
  /**
   * Qué puede ver el agente. Es el único eje que separa los dos modos, y no es
   * un matiz de redacción: en `medicion_oculta` el servicio le quita `backtest` del
   * juego de herramientas, que es la única que revela lo medido. La garantía es
   * la herramienta ausente, no el prompt. Mismos dos nombres en el backend
   * (`agent.MODOS`) y en el mapa de arquitectura.
   */
  modo?: IdModo;
  /**
   * Qué pedir para revelar lo medido, DESPUÉS de que el agente se comprometió.
   *
   * Es una consulta aparte que hace LA CONSOLA, no un dato que se le pase al
   * agente: si le llegara, su justificación sería una racionalización. Que sea
   * una llamada separada además lo hace demostrable desde la pestaña de red.
   *
   * Se pide el valor del INSTANTE, no el promedio de la franja: el agente
   * predijo un instante, y compararlo contra una media horaria sería medir el
   * error contra otra cantidad (en el 22-jul 13:00 son 315,4 vs 307,5).
   */
  revelar?: Revelar | null;
};

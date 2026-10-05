// Casilla 1: la última actualización del dato.
//
// No es un dato neutro. El sistema dejó de reportar el 2026-06-01 y hoy lleva
// más de noventa días callado: si esto se pintara como una casilla más, alguien
// leería las otras ocho creyendo que hablan de hoy. Por eso ocupa una franja
// entera, lleva `role="alert"` cuando el sistema está detenido, y dice
// explícitamente que todo lo de abajo es pasado.
//
// `actualizacion.mensaje` del backend NO se muestra: dice «sin datos nuevos hace
// 92 dias, sobre un umbral de 7: el sistema dejo de reportar», que es palabra
// por palabra el titular, la antigüedad y el umbral que ya están al lado. Sus
// tres números siguen todos en pantalla, cada uno una sola vez.
import {
  formatDays,
  formatLocalStamp,
} from "@/app/components/analitica/tablero/format";
import type { Freshness, FreshnessState } from "@/app/lib/analitica/contracts/tablero";
import styles from "@/app/components/analitica/tablero/tablero.module.css";

const HEADLINE: Readonly<Record<FreshnessState, string>> = {
  up_to_date: "El dato está al día",
  lagging: "El dato viene con atraso",
  stopped: "El sistema dejó de reportar",
  no_data: "Sin ninguna lectura del inversor en este rango",
};

const TONE_CLASS: Readonly<Record<FreshnessState, string>> = {
  up_to_date: "",
  lagging: styles.freshnessWarning,
  stopped: styles.freshnessCritical,
  no_data: styles.freshnessCritical,
};

const ALARMING: Readonly<Record<FreshnessState, boolean>> = {
  up_to_date: false,
  lagging: false,
  stopped: true,
  no_data: true,
};

const STALE_WARNING =
  "Las ocho casillas de abajo describen ese pasado, no la producción de hoy.";

export function FreshnessBanner({ freshness }: { readonly freshness: Freshness }) {
  const alarming = ALARMING[freshness.state];
  return (
    <section
      className={`${styles.freshness} ${TONE_CLASS[freshness.state]}`}
      role={alarming ? "alert" : "status"}
      aria-label="Última actualización del dato"
    >
      <span className={styles.freshnessHeadline}>{HEADLINE[freshness.state]}</span>
      {freshness.ageDays === null ? null : (
        <span className={styles.freshnessAge}>{formatDays(freshness.ageDays)} sin dato nuevo</span>
      )}
      {freshness.lastDataAt === null ? null : (
        <span className="muted mono small">
          último registro: {formatLocalStamp(freshness.lastDataAt)} (hora local de Costa Rica)
        </span>
      )}
      <p className={styles.freshnessDetail}>
        Umbral de alarma: {formatDays(freshness.alarmingThresholdDays)} sin reportar.
        {alarming ? ` ${STALE_WARNING}` : ""}
      </p>
    </section>
  );
}

// Los DOS ejes del período, uno al lado del otro y nunca fundidos en un
// semáforo único. Es lo primero y lo más grande de la pantalla: quien entra acá
// viene a saber si puede fiarse del período, y todo lo demás es la letra chica
// de estas dos cifras.
//
// Un día con la planta parada es un día con dato BUENO sobre un sistema MALO.
// Mezclar las dos cosas hunde la confianza de meses cuya energía es exacta, así
// que acá se ven separadas: distinta tarjeta, distinta etiqueta, distinto borde,
// y cada una con la advertencia que el backend redactó para ella.
//
// El eje del dato lleva pegado el desglose comprimido: su número no puede
// aparecer nunca solo, ni siquiera con otra pestaña abierta.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { UsableSpread } from "@/app/components/analitica/calidad/UsableSpread";
import { formatCount } from "@/app/components/analitica/calidad/format";
import type { EquipmentAvailability, QualityVerdict } from "@/app/lib/analitica/contracts/calidad";

export const DATA_AXIS_NAME = "Eje 1: calidad del dato";
export const EQUIPMENT_AXIS_NAME = "Eje 2: disponibilidad del equipo";

export type VerdictSplitProps = {
  readonly verdict: QualityVerdict;
  /** La nota del backend sobre cuándo un día deja de ser utilizable. */
  readonly note: string;
};

export function VerdictSplit({ verdict, note }: VerdictSplitProps) {
  return (
    <div className={styles.split}>
      <DataAxis verdict={verdict} note={note} />
      <EquipmentAxis availability={verdict.availability} />
    </div>
  );
}

function DataAxis({ verdict, note }: VerdictSplitProps) {
  return (
    <section className={`card ${styles.axis} ${styles.axisEje}`} aria-label={DATA_AXIS_NAME}>
      <p className={styles.axisTag}>{DATA_AXIS_NAME}</p>
      <h2 className="kpi-title">Días utilizables con TODAS las variables sanas a la vez</h2>
      <p className={styles.big}>
        {formatCount(verdict.usableDays)}{" "}
        <span className="muted small">de {formatCount(verdict.daysWithData)} con datos</span>
      </p>
      <UsableSpread variables={verdict.byVariable} />
      {verdict.warning ? (
        <p className={styles.warning} role="note">
          {verdict.warning}
        </p>
      ) : null}
      <p className="muted small">{note}</p>
    </section>
  );
}

function EquipmentAxis({ availability }: { readonly availability: EquipmentAvailability }) {
  return (
    <section className={`card ${styles.axis} ${styles.axisEquipo}`} aria-label={EQUIPMENT_AXIS_NAME}>
      <p className={styles.axisTag}>{EQUIPMENT_AXIS_NAME}</p>
      <h2 className="kpi-title">Días con la planta parada en horario operativo</h2>
      <p className={styles.big}>
        {formatCount(availability.stoppedDays)}{" "}
        <span className="muted small">
          de {formatCount(availability.ofDaysWithData)} con datos
        </span>
      </p>
      <p className={styles.ends}>
        <span>
          con sol pleno <b className="mono">{formatCount(availability.stoppedUnderSunDays)}</b>
        </span>
      </p>
      {availability.warning ? (
        <p className={styles.warning} role="note">
          {availability.warning}
        </p>
      ) : null}
      <p className="muted small">{availability.note}</p>
    </section>
  );
}

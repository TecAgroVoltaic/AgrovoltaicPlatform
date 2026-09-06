// El contexto de las nueve casillas, en DOS tarjetas que no se tocan.
//
// La separación no es estética. «La planta estuvo parada 90 de 228 días, 69 de
// ellos con sol pleno» NO es un problema de calidad del dato: el dato de esos
// días es correcto, lo que falló fue el equipo. Fundir las dos cosas en un solo
// indicador haría creer que hay que arreglar el pipeline cuando lo que hay que
// revisar es el inversor, y al revés. El backend ya las manda separadas
// (`confianza` y `confianza.disponibilidad`) y acá se respeta esa frontera.
//
// Las dos advertencias en pantalla son las del BACKEND, palabra por palabra: ya
// vienen redactadas con números y con qué hacer, y una versión propia al lado
// solo repetiría lo mismo peor.
import { formatFraction } from "@/app/components/analitica/tablero/format";
import { StatBars } from "@/app/components/analitica/tablero/StatBars";
import type { Availability, DashboardConfidence } from "@/app/lib/analitica/contracts/tablero";
import styles from "@/app/components/analitica/tablero/tablero.module.css";

const DAYS_UNIT = "días";
const COVERAGE_TITLE = "Cuánto del período se midió";

const MISSING_CONFIDENCE =
  "El servicio no envió el bloque de confianza con la forma esperada: no se puede decir cuánto " +
  "del período se midió.";

export function ConfidenceCard({
  confidence,
}: {
  readonly confidence: DashboardConfidence | null;
}) {
  if (confidence === null) {
    return (
      <section className="card">
        <h2 className={styles.cardTitle}>{COVERAGE_TITLE}</h2>
        <p className="hint">{MISSING_CONFIDENCE}</p>
      </section>
    );
  }
  return (
    <section className="card">
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{COVERAGE_TITLE}</h2>
        <span className={styles.headStat}>
          Cobertura <b>{formatFraction(confidence.coverage)}</b>
        </span>
      </div>
      <StatBars
        total={confidence.daysInRange}
        unit={DAYS_UNIT}
        bars={[
          { id: "with-data", label: "Con alguna fila", value: confidence.daysWithData },
          {
            id: "usable",
            label: "Utilizables en TODAS las variables",
            value: confidence.usableDays,
            tone: "warn",
          },
        ]}
      />
      {confidence.warning ? <p className="kpi-nota">{confidence.warning}</p> : null}
    </section>
  );
}

export function AvailabilityCard({
  availability,
}: {
  readonly availability: Availability | null;
}) {
  if (availability === null) return null;
  return (
    <section className="card">
      <h2 className={styles.cardTitle}>La planta parada: una avería, no un dato malo</h2>
      <StatBars
        total={availability.ofDaysWithData}
        unit={DAYS_UNIT}
        bars={[
          {
            id: "stopped",
            label: "Sin acoplar en horario operativo",
            value: availability.stoppedDays,
            tone: "warn",
          },
          {
            id: "stopped-under-sun",
            label: "De esos, con sol pleno",
            value: availability.stoppedUnderSunDays,
            tone: "warn",
          },
        ]}
      />
      <p className="kpi-nota">{availability.warning}</p>
    </section>
  );
}

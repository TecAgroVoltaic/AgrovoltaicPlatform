// El período día a día, en DOS tiras alineadas: arriba qué tan bueno es el dato,
// abajo qué hizo el equipo. La misma posición es el mismo día en las dos, así
// que se ve de un vistazo que un día "Ausente" arriba y un día "Parado con sol"
// abajo son problemas de naturaleza distinta.
//
// Un día sin datos NO es un día aprobado: sale hueco y con contorno punteado,
// nunca del color de un día limpio.
//
// Los días llegan como estado y no como lista porque esta es la lectura más
// pesada de la vista (221 KB, 660 días) y solo se pide cuando esta pestaña se
// abre. Con el bloque montado sin dato, sus cuatro estados son suyos.
//
// POR QUÉ ESTO NO USA `CalendarHeatmapChart`, aunque se le parezca:
// esa primitiva es CUANTITATIVA (`visualMap` continuo con min/max y una rampa
// interpolada) y acá el dato es CATEGÓRICO, con "Ausente" fuera de la escala de
// gravedad en vez de en un extremo. Al pasarlo por ella, "Sin hallazgos" y
// "Grave" llegan al tooltip como `1` y `3`, la rampa única vuelve a fundir los
// dos ejes que esta vista separa, y un lienzo expone un solo `role="img"`: las
// 660 descripciones por tira y las tramas que evitan depender del color no
// sobreviven al canvas. Un mapa categórico necesitaría un `visualMap` por
// tramos, que hoy ni siquiera está registrado en `charts/echarts.ts`.
// Esto no es un gráfico dibujado a mano: no hay escalas, ni ejes, ni geometría
// propia, solo celdas que coloca el navegador.
import { DayStrip, type DayCell } from "@/app/components/analitica/calidad/DayStrip";
import { SectionState } from "@/app/components/analitica/calidad/SectionState";
import {
  DAY_VERDICT_BADGE,
  PLANT_STATE_BADGE,
  plantStateOf,
  type StateBadge,
} from "@/app/components/analitica/calidad/labels";
import { formatCount } from "@/app/components/analitica/calidad/format";
import type { ChartState } from "@/app/components/charts";
import type { QualityDay } from "@/app/lib/analitica/contracts/calidad";

const WHAT = "el período día a día";

const QUALITY_LEGEND: readonly StateBadge[] = [
  DAY_VERDICT_BADGE.critical,
  DAY_VERDICT_BADGE.warning,
  DAY_VERDICT_BADGE.ok,
  DAY_VERDICT_BADGE.noData,
];

const PLANT_LEGEND: readonly StateBadge[] = [
  PLANT_STATE_BADGE.stoppedUnderSun,
  PLANT_STATE_BADGE.stopped,
  PLANT_STATE_BADGE.running,
  PLANT_STATE_BADGE.noData,
];

export type DayMapProps = { readonly state: ChartState<readonly QualityDay[]> };

export function DayMap({ state }: DayMapProps) {
  return (
    <section className="card" aria-labelledby="mapa-dias">
      <h2 className="kpi-title" id="mapa-dias">
        El período día a día, en sus dos ejes
      </h2>
      <SectionState what={WHAT} state={state} />
      {state.status === "ready" ? (
        <>
          <DayStrip
            title="Calidad del dato"
            cells={state.data.map(qualityCell)}
            legend={QUALITY_LEGEND}
          />
          <DayStrip
            title="Disponibilidad del equipo"
            cells={state.data.map(plantCell)}
            legend={PLANT_LEGEND}
          />
        </>
      ) : null}
    </section>
  );
}

function qualityCell(day: QualityDay): DayCell {
  const badge = DAY_VERDICT_BADGE[day.verdict];
  const counts =
    day.verdict === "noData"
      ? "sin ninguna fila"
      : `radiación ${formatCount(day.radiation.critical)} graves y ${formatCount(day.radiation.warnings)} avisos; ` +
        `eléctrico ${formatCount(day.electrical.critical)} graves y ${formatCount(day.electrical.warnings)} avisos`;
  return { date: day.date, badge, description: `${day.date}, ${badge.label}: ${counts}` };
}

function plantCell(day: QualityDay): DayCell {
  const badge = PLANT_STATE_BADGE[plantStateOf(day)];
  const sky = day.skyClass ? `, cielo ${day.skyClass}` : "";
  const unpaired =
    day.verdict === "noData"
      ? ""
      : `, ${formatCount(day.unpairedReadings)} lecturas sin acoplar`;
  return {
    date: day.date,
    badge,
    description: `${day.date}, ${badge.label}${unpaired}${sky}`,
  };
}

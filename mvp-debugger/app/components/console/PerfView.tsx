"use client";
// Rendimiento: KPIs reales (tools del analizador) + series vía /datos/serie.
// Honesto: el gráfico de "potencia" es potencia media por bucket (robusta a la
// cadencia variable); la energía real en kWh vive en el KPI.
//
// Las piezas viven en `perf/`: los datos en tres hooks (indicadores, series
// diarias descargadas una vez, y lo que se deriva de ellas) y la pantalla en
// cuatro bloques.
import { useState } from "react";

import { PERIODS, VARS } from "@/app/components/console/perfCatalogo";
import { NubeCard } from "@/app/components/console/perf/NubeCard";
import { PerfControles } from "@/app/components/console/perf/PerfControles";
import { PerfKpis } from "@/app/components/console/perf/PerfKpis";
import { SerieCard } from "@/app/components/console/perf/SerieCard";
import { useDiarias } from "@/app/components/console/perf/useDiarias";
import { usePerfKpis } from "@/app/components/console/perf/usePerfKpis";
import { useRendimiento } from "@/app/components/console/perf/useRendimiento";

export function PerfView({ theme }: { theme: string }) {
  const [vari, setVari] = useState("pot");
  const [period, setPeriod] = useState("y2026");
  const [cmp, setCmp] = useState("ambos");
  const [intento, setIntento] = useState(0);
  const reintentar = () => setIntento((i) => i + 1);

  const V = VARS[vari], P = PERIODS[period];
  const { kpi, errKpi } = usePerfKpis(intento);
  const { diarias, listo, errSerie, errScat } = useDiarias(V, intento);
  const { series, scat, referencia } = useRendimiento({ diarias, listo, V, P, vari, period });

  // El tema no se lee acá: cambiarlo re-renderiza la vista y la paleta del
  // gráfico se vuelve a leer de las variables CSS.
  void theme;

  return (
    <section>
      <div className="phead">
        <h1>Rendimiento del sistema</h1>
        <p>Generación, irradiancia y eficiencia por arreglo: PV1 inclinado vs PV2 vertical (bifacial). Datos vivos de la Supabase PV.</p>
      </div>

      <PerfKpis kpi={kpi} errKpi={errKpi} onReintentar={reintentar} />

      <PerfControles
        period={period} vari={vari} cmp={cmp} conComparar={V.cmp}
        onPeriod={setPeriod} onVari={setVari} onCmp={setCmp}
      />

      <SerieCard
        vari={vari} V={V} P={P} cmp={cmp} series={series} referencia={referencia}
        errSerie={errSerie} onReintentar={reintentar}
      />

      <NubeCard scat={scat} P={P} errScat={errScat} onReintentar={reintentar} />
    </section>
  );
}

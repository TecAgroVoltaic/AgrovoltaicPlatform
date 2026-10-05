"use client";
// El informe completo, una vez que el dato llegó. Compone, sostiene el filtro de
// hallazgos y decide qué lectura sale y cuándo.
//
// LA SEGMENTACIÓN, que es de lo que va este archivo: arriba queda lo que se
// contesta en tres segundos y no se puede esconder detrás de ningún gesto (los
// DOS ejes del veredicto, qué problema toca más días, y qué hallazgos no puede
// ver el veredicto). Abajo, en pestañas, las tres preguntas que se hacen
// después, cada una con su propia tarea: qué variable frena, qué días sirven, y
// qué está roto.
//
// Y por eso las lecturas no salen todas juntas: `calidad/dias` son 221 KB y
// `arquitectura` 32 KB que solo sirven dentro de una pestaña. Pedirlas al entrar
// es gastar el 84 % de lo que baja la pantalla en lo que nadie está mirando.
import { useState } from "react";

import { DayMap } from "@/app/components/analitica/calidad/DayMap";
import { FindingTypesTable } from "@/app/components/analitica/calidad/FindingTypesTable";
import { FindingsBrowser } from "@/app/components/analitica/calidad/FindingsBrowser";
import { QualityTabs, type QualityTab } from "@/app/components/analitica/calidad/QualityTabs";
import { TopProblems } from "@/app/components/analitica/calidad/TopProblems";
import { UsableDaysByVariable } from "@/app/components/analitica/calidad/UsableDaysByVariable";
import { VerdictSplit } from "@/app/components/analitica/calidad/VerdictSplit";
import { Vigilance } from "@/app/components/analitica/calidad/Vigilance";
import { useDeferredAnalytics } from "@/app/components/analitica/calidad/useDeferredAnalytics";
import {
  FIRST_QUERY,
  withFilters,
  type FindingsQuery,
} from "@/app/components/analitica/calidad/useFindingsQuery";
import type { QualityOverview } from "@/app/components/analitica/calidad/useQualityOverview";
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import {
  findingGlossarySchema,
  qualityDaysSchema,
  type QualityDay,
} from "@/app/lib/analitica/contracts/calidad";

const TAB_VARIABLES = "variables";
const TAB_DAYS = "days";
const TAB_BROKEN = "broken";
const TABS_LABEL = "Detalle de la calidad del período";
const NO_DAYS: readonly QualityDay[] = [];

export type QualityReportProps = {
  readonly data: QualityOverview;
  readonly range: DateRange;
};

export function QualityReport({ data, range }: QualityReportProps) {
  const [activeTab, setActiveTab] = useState(TAB_VARIABLES);
  const [query, setQuery] = useState<FindingsQuery>(FIRST_QUERY);
  const { verdict, note, topProblems, types, vigilance } = data.summary;

  const daysState = useDeferredAnalytics({
    path: "calidad/dias",
    range,
    schema: qualityDaysSchema,
    enabled: activeTab === TAB_DAYS || activeTab === TAB_BROKEN,
  });
  const glossaryState = useDeferredAnalytics({
    path: "arquitectura",
    range,
    schema: findingGlossarySchema,
    enabled: activeTab === TAB_BROKEN,
  });

  const tabs: readonly QualityTab[] = [
    {
      id: TAB_VARIABLES,
      label: "Por variable",
      panel: <UsableDaysByVariable variables={verdict.byVariable} />,
    },
    { id: TAB_DAYS, label: "Día a día", panel: <DayMap state={daysState} /> },
    {
      id: TAB_BROKEN,
      label: "Qué está roto",
      panel: (
        <>
          <FindingTypesTable
            types={types}
            glossaryState={glossaryState}
            onSelectType={(type) => setQuery(withFilters({ ...query.filters, type }))}
          />
          <FindingsBrowser
            range={range}
            firstPage={data.findings}
            days={daysState.status === "ready" ? daysState.data : NO_DAYS}
            query={query}
            onQueryChange={setQuery}
          />
        </>
      ),
    },
  ];

  return (
    <>
      <VerdictSplit verdict={verdict} note={note} />
      <div className={styles.split}>
        <TopProblems problems={topProblems} daysWithData={verdict.daysWithData} />
        <Vigilance vigilance={vigilance} findingsInPeriod={data.findings.total} />
      </div>
      <QualityTabs
        label={TABS_LABEL}
        tabs={tabs}
        activeId={activeTab}
        onSelect={setActiveTab}
      />
    </>
  );
}

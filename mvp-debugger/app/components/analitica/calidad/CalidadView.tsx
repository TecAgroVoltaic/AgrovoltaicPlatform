"use client";
// La vista Calidad. Lee el rango del cascarón (vive en la URL), dispara la carga
// única y decide entre los cuatro estados.
//
// Con `status` distinto de `"ready"` el informe ni se monta: el tipo `ChartState`
// impide pintar una tabla de calidad sin datos por descuido, que en este
// producto sería lo más parecido a mentir.
import { SectionState } from "@/app/components/analitica/calidad/SectionState";
import { QualityReport } from "@/app/components/analitica/calidad/QualityReport";
import { useQualityOverview } from "@/app/components/analitica/calidad/useQualityOverview";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { formatRange } from "@/app/lib/analitica/dateRange";

const WHAT = "el estado de calidad del período";

export function CalidadView() {
  const { range } = useDateRange();
  const { state } = useQualityOverview(range);

  return (
    <>
      <p className="muted small">Período analizado: {formatRange(range)}.</p>
      <SectionState what={WHAT} state={state} />
      {state.status === "ready" ? (
        // `key` por rango: cambiar el período reinicia filtro y página. Sin
        // esto, quien venía de la página seis de mayo aterriza en la página
        // seis de una semana que tiene dos, y el vacío parece un fallo.
        <QualityReport
          key={`${range.from}:${range.toExclusive}`}
          data={state.data}
          range={range}
        />
      ) : null}
    </>
  );
}

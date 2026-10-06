"use client";
// El formulario del rango: desde, hasta, grano, Aplicar y los atajos, más los
// avisos sobre el rango vigente. Lo usan la barra del cascarón (`RangeSelector`)
// y el chip de contexto del Asistente.
//
// Las fechas se eligen en un calendario que no deja tomar un día sin datos
// (`DatePicker`). La persona elige el ÚLTIMO DÍA INCLUIDO («Hasta»): el fin
// exclusivo de la URL es un detalle técnico, y se convierte (+1 día) recién al
// aplicar. Lo demás lo valida el MISMO intérprete que lee la URL, así un rango
// armado acá y uno pegado en la barra de direcciones fallan igual.
import { useEffect, useState, type FormEvent } from "react";

import { DatePicker } from "@/app/components/analitica/DatePicker";
import { RangeNotices } from "@/app/components/analitica/RangeNotices";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { useDaysWithData } from "@/app/lib/analitica/useDaysWithData";
import { GRANULARITIES, GRANULARITY_LABEL } from "@/app/lib/analitica/granularity";
import { DEFAULT_RANGE, RANGE_PRESETS } from "@/app/lib/analitica/coverage";
import { draftFromRange, draftToRange } from "@/app/lib/analitica/rangeDraft";
import type { RangeProblem } from "@/app/lib/analitica/urlRange";
import type { DateRange } from "@/app/lib/analitica/dateRange";

export type RangeFormProps = {
  /** Prefijo de los ids de los campos: dos formularios en la misma página no
   *  pueden compartir ids, o cada <label> apuntaría al campo equivocado. */
  readonly idPrefix: string;
  /** Se llama después de escribir un rango válido en la URL. */
  readonly onApplied?: () => void;
};

export function RangeForm({ idPrefix, onApplied }: RangeFormProps) {
  const { range, parse, setRange } = useDateRange();
  const daysWithData = useDaysWithData();
  const [draft, setDraft] = useState(() => draftFromRange(range));
  const [problems, setProblems] = useState<readonly RangeProblem[]>([]);
  const fieldId = { from: `${idPrefix}-desde`, to: `${idPrefix}-hasta`, granularity: `${idPrefix}-grano` };
  const labelId = { from: `${fieldId.from}-rotulo`, to: `${fieldId.to}-rotulo` };
  const summaryId = `${idPrefix}-resumen`;
  const publishedCoverage = daysWithData.status === "ready" ? daysWithData.bounds : undefined;

  // La URL manda: si cambia (por un atajo, por el botón atrás, por un enlace
  // compartido), el formulario refleja lo que se está mirando de verdad.
  useEffect(() => setDraft(draftFromRange(range)), [range]);

  function commit(next: DateRange) {
    setProblems([]);
    setRange(next);
    onApplied?.();
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attempt = draftToRange(draft);
    if (attempt.ok) commit(attempt.range);
    else setProblems(attempt.problems);
  }

  return (
    <>
      <form className="rng-form" onSubmit={apply}>
        <div className="rng-campo">
          <label className="lbl" id={labelId.from} htmlFor={fieldId.from}>
            Desde
          </label>
          <DatePicker
            id={fieldId.from}
            labelId={labelId.from}
            value={draft.from}
            daysWithData={daysWithData}
            onChange={(from) => setDraft({ ...draft, from })}
          />
        </div>
        <div className="rng-campo">
          <label className="lbl" id={labelId.to} htmlFor={fieldId.to}>
            Hasta
          </label>
          <DatePicker
            id={fieldId.to}
            labelId={labelId.to}
            value={draft.lastIncludedDay}
            daysWithData={daysWithData}
            onChange={(lastIncludedDay) => setDraft({ ...draft, lastIncludedDay })}
          />
        </div>
        <div className="rng-campo">
          <label className="lbl" htmlFor={fieldId.granularity}>
            Grano
          </label>
          <select
            id={fieldId.granularity}
            className="select"
            value={draft.granularity}
            onChange={(event) => setDraft({ ...draft, granularity: readGranularity(event.target.value) })}
          >
            {GRANULARITIES.map((granularity) => (
              <option key={granularity} value={granularity}>
                {GRANULARITY_LABEL[granularity]}
              </option>
            ))}
          </select>
        </div>
        <div className="rng-acciones">
          <button className="btn" type="submit" aria-describedby={summaryId}>
            Aplicar
          </button>
        </div>
        <div className="rng-presets" role="group" aria-label="Rangos rápidos">
          {RANGE_PRESETS.map((preset) => (
            <button key={preset.id} className="chip" type="button" onClick={() => commit(preset.build(publishedCoverage))}>
              {preset.label}
            </button>
          ))}
        </div>
      </form>
      <RangeNotices
        range={range}
        parse={parse}
        formProblems={problems}
        summaryId={summaryId}
        daysWithData={daysWithData}
      />
    </>
  );
}

/** El `value` de un <select> es una cadena; el tipo no se puede asumir. */
function readGranularity(value: string) {
  return GRANULARITIES.find((granularity) => granularity === value) ?? DEFAULT_RANGE.granularity;
}

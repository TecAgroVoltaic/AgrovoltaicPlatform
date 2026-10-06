"use client";
// El formulario del rango: desde, hasta, grano, Aplicar y los atajos, más los
// avisos sobre el rango vigente. Lo usan la barra del cascarón (`RangeSelector`)
// y el chip de contexto del Asistente.
//
// El formulario NO valida por su cuenta: le pasa lo que la persona escribió al
// MISMO intérprete que lee la URL. Así una fecha inválida escrita a mano y una
// pegada en la barra de direcciones fallan igual y con el mismo mensaje.
import { useEffect, useState, type FormEvent } from "react";

import { RangeNotices } from "@/app/components/analitica/RangeNotices";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { GRANULARITIES, GRANULARITY_LABEL, granularityToWire } from "@/app/lib/analitica/granularity";
import { DEFAULT_RANGE, RANGE_PRESETS } from "@/app/lib/analitica/coverage";
import { parseRangeParams, readerFromRecord, type RangeProblem } from "@/app/lib/analitica/urlRange";
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
  const [draft, setDraft] = useState(range);
  const [problems, setProblems] = useState<readonly RangeProblem[]>([]);
  const fieldId = { from: `${idPrefix}-desde`, to: `${idPrefix}-hasta`, granularity: `${idPrefix}-grano` };
  const summaryId = `${idPrefix}-resumen`;

  // La URL manda: si cambia (por un atajo, por el botón atrás, por un enlace
  // compartido), el formulario refleja lo que se está mirando de verdad.
  useEffect(() => setDraft(range), [range]);

  function commit(next: DateRange) {
    setProblems([]);
    setRange(next);
    onApplied?.();
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attempt = parseRangeParams(
      readerFromRecord({
        desde: draft.from,
        hasta: draft.toExclusive,
        granularidad: granularityToWire(draft.granularity),
      }),
    );
    if (attempt.outcome !== "parsed") {
      setProblems(attempt.outcome === "fallback" ? attempt.problems : []);
      return;
    }
    commit(attempt.range);
  }

  return (
    <>
      <form className="rng-form" onSubmit={apply}>
        <div className="rng-campo">
          <label className="lbl" htmlFor={fieldId.from}>
            Desde
          </label>
          <input
            id={fieldId.from}
            className="input input-sm"
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </div>
        <div className="rng-campo">
          <label className="lbl" htmlFor={fieldId.to}>
            Hasta (exclusivo)
          </label>
          <input
            id={fieldId.to}
            className="input input-sm"
            type="date"
            value={draft.toExclusive}
            onChange={(event) => setDraft({ ...draft, toExclusive: event.target.value })}
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
            <button key={preset.id} className="chip" type="button" onClick={() => commit(preset.build())}>
              {preset.label}
            </button>
          ))}
        </div>
      </form>
      <RangeNotices range={range} parse={parse} formProblems={problems} summaryId={summaryId} />
    </>
  );
}

/** El `value` de un <select> es una cadena; el tipo no se puede asumir. */
function readGranularity(value: string) {
  return GRANULARITIES.find((granularity) => granularity === value) ?? DEFAULT_RANGE.granularity;
}

"use client";
// El selector de rango: la pieza central del sistema (Fig. 3 del PDF).
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

const FIELD_ID = { from: "rango-desde", to: "rango-hasta", granularity: "rango-grano" };
const SUMMARY_ID = "rango-resumen";

export function RangeSelector() {
  const { range, parse, setRange } = useDateRange();
  const [draft, setDraft] = useState(range);
  const [problems, setProblems] = useState<readonly RangeProblem[]>([]);

  // La URL manda: si cambia (por un atajo, por el botón atrás, por un enlace
  // compartido), el formulario refleja lo que se está mirando de verdad.
  useEffect(() => setDraft(range), [range]);

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
    setProblems([]);
    setRange(attempt.range);
  }

  // No se llama `usePreset`: el prefijo `use` esta reservado para los hooks y esto
  // es un manejador corriente. Con el nombre viejo, `rules-of-hooks` lo tomaba por
  // un hook llamado dentro de un callback y marcaba error, que es la herramienta
  // haciendo bien su trabajo sobre un nombre que engaña tambien al que lee.
  function applyPreset(preset: DateRange) {
    setProblems([]);
    setRange(preset);
  }

  return (
    <section className="rng" aria-labelledby="rango-titulo">
      {/* Rótulo y no <h2>: la barra se pinta ANTES del título de la página, y un
          encabezado acá dejaría el orden de lectura con un h2 delante del h1. */}
      <p id="rango-titulo" className="lbl">
        Rango de análisis
      </p>
      <form className="rng-form" onSubmit={apply}>
        <div className="rng-campo">
          <label className="lbl" htmlFor={FIELD_ID.from}>
            Desde
          </label>
          <input
            id={FIELD_ID.from}
            className="input input-sm"
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </div>
        <div className="rng-campo">
          <label className="lbl" htmlFor={FIELD_ID.to}>
            Hasta (exclusivo)
          </label>
          <input
            id={FIELD_ID.to}
            className="input input-sm"
            type="date"
            value={draft.toExclusive}
            onChange={(event) => setDraft({ ...draft, toExclusive: event.target.value })}
          />
        </div>
        <div className="rng-campo">
          <label className="lbl" htmlFor={FIELD_ID.granularity}>
            Grano
          </label>
          <select
            id={FIELD_ID.granularity}
            className="select"
            value={draft.granularity}
            onChange={(event) =>
              setDraft({ ...draft, granularity: readGranularity(event.target.value) })
            }
          >
            {GRANULARITIES.map((granularity) => (
              <option key={granularity} value={granularity}>
                {GRANULARITY_LABEL[granularity]}
              </option>
            ))}
          </select>
        </div>
        <div className="rng-acciones">
          <button className="btn" type="submit" aria-describedby={SUMMARY_ID}>
            Aplicar
          </button>
        </div>
        <div className="rng-presets" role="group" aria-label="Rangos rápidos">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="chip"
              type="button"
              onClick={() => applyPreset(preset.build())}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </form>
      <RangeNotices
        range={range}
        parse={parse}
        formProblems={problems}
        summaryId={SUMMARY_ID}
      />
    </section>
  );
}

/** El `value` de un <select> es una cadena; el tipo no se puede asumir. */
function readGranularity(value: string) {
  return GRANULARITIES.find((granularity) => granularity === value) ?? DEFAULT_RANGE.granularity;
}

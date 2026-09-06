"use client";
// La vista Estadística: las cuatro figuras del PDF sobre un mismo rango.
//
// Las cinco consultas salen juntas (ver `useStatistics`) y cada figura decide su
// propio estado: una que falle deja a las otras cuatro pintadas.
import { useState } from "react";

import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { VariablePicker } from "@/app/components/analitica/estadistica/VariablePicker";
import { useStatistics } from "@/app/components/analitica/estadistica/useStatistics";
import {
  coverageGap,
  correlationTargetFor,
  DEFAULT_FOCUS_VARIABLE,
  INCIDENT_IRRADIANCE,
  type FocusVariable,
} from "@/app/components/analitica/estadistica/focusVariables";
import { BoxesFigure } from "@/app/components/analitica/estadistica/figures/BoxesFigure";
import { CorrelationFigure } from "@/app/components/analitica/estadistica/figures/CorrelationFigure";
import { FolderFigure } from "@/app/components/analitica/estadistica/figures/FolderFigure";
import { IrradiationFigure } from "@/app/components/analitica/estadistica/figures/IrradiationFigure";
import { RidgesFigure } from "@/app/components/analitica/estadistica/figures/RidgesFigure";
import styles from "@/app/components/analitica/estadistica/vista.module.css";

export function EstadisticaView() {
  const { range } = useDateRange();
  // El foco vive en React y no en la URL a propósito: el selector de rango del
  // cascarón reescribe la query entera al cambiar de período, y un parámetro
  // propio se perdería en silencio. Queda anotado como deuda: el día que el
  // selector conserve el resto de la query, esto se muda a la URL y se comparte.
  const [focus, setFocus] = useState<FocusVariable>(DEFAULT_FOCUS_VARIABLE);
  const correlationTarget = correlationTargetFor(focus);
  const { distribution, irradiation, ridges, correlation, folder, reload } = useStatistics({
    range,
    focusKey: focus.key,
    correlationTargetKey: correlationTarget.key,
  });

  const focusGap = coverageGap(range, focus);

  return (
    <>
      <div className="controls">
        <VariablePicker selected={focus} onSelect={setFocus} />
      </div>

      <div className={styles.par}>
        <BoxesFigure
          result={distribution}
          outOfCoverage={focusGap}
          onRetry={reload}
          focusLabel={focus.label}
        />
        <IrradiationFigure
          result={irradiation}
          outOfCoverage={coverageGap(range, INCIDENT_IRRADIANCE)}
          onRetry={reload}
        />
      </div>

      <div className={styles.par}>
        {/* Las tres temperaturas cubren todo el histórico, y si alguna no, el
            backend lo dice grupo por grupo dentro de la respuesta. */}
        <RidgesFigure result={ridges} outOfCoverage={null} onRetry={reload} />
        <CorrelationFigure
          result={correlation}
          outOfCoverage={coverageGap(range, INCIDENT_IRRADIANCE, correlationTarget)}
          onRetry={reload}
          focusLabel={correlationTarget.label}
        />
      </div>

      <FolderFigure
        result={folder}
        outOfCoverage={focusGap}
        onRetry={reload}
        focusLabel={focus.label}
      />
    </>
  );
}

"use client";
// El botón que pide el informe en Excel y dice qué está pasando mientras tanto.
// El estado (tiempo transcurrido, cancelación, aviso sin lectura) vive en
// `useReportDownload`, que comparte con la tarjeta del asistente.
import estilos from "./informe.module.css";
import { READING_HEADER, WITHOUT_READING, useReportDownload } from "./useReportDownload";

export const CABECERA_LECTURA = READING_HEADER;
export const SIN_LECTURA = WITHOUT_READING;

type Props = { url: string; conLectura: boolean; deshabilitado?: boolean; etiqueta?: string };

export function BotonInforme({ url, conLectura, deshabilitado = false, etiqueta = "Generar informe (Excel)" }: Props) {
  const { state, generate, cancel } = useReportDownload(url, conLectura);

  if (state.phase === "generating") {
    return (
      <>
        <button className="btn dl-btn" disabled>Generando… {state.seconds} s</button>
        <button className={`btn ghost sm ${estilos.ancho}`} onClick={cancel}>Cancelar</button>
        {conLectura && <p className={`muted small ${estilos.nota}`}>El agente redacta la lectura: suele tardar menos de un minuto.</p>}
      </>
    );
  }
  return (
    <>
      <button className="btn dl-btn" disabled={deshabilitado} onClick={() => void generate()}>{etiqueta}</button>
      {state.phase === "error" && <div className={`alert ${estilos.nota}`}>No se pudo generar: {state.reason}</div>}
      {state.phase === "done" && <p className={`muted small mono ${estilos.nota}`}>listo · {state.fileName}</p>}
      {state.phase === "done" && state.withoutReading && (
        <div className={`alert ${estilos.nota}`}>Salió sin lectura. El motivo está en la hoja Resumen.</div>
      )}
    </>
  );
}

"use client";
// El botón que pide el informe en Excel y dice qué está pasando mientras tanto.
// El informe llega entero al final (no hay bytes parciales que contar), así que
// el progreso que se muestra es el tiempo transcurrido.
import { useEffect, useState } from "react";
import { bajarArchivo } from "./bajar";
import estilos from "./informe.module.css";

type Estado =
  | { fase: "quieto" }
  | { fase: "generando"; segundos: number }
  | { fase: "error"; motivo: string }
  | { fase: "listo"; archivo: string; sinLectura: boolean };

export const CABECERA_LECTURA = "x-informe-lectura";
export const SIN_LECTURA = "sin_lectura";

type Props = { url: string; conLectura: boolean; deshabilitado?: boolean; etiqueta?: string };

export function BotonInforme({ url, conLectura, deshabilitado = false, etiqueta = "Generar informe (Excel)" }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "quieto" });
  const [corte, setCorte] = useState<AbortController | null>(null);
  const generando = estado.fase === "generando";

  useEffect(() => {
    if (!generando) return;
    const reloj = setInterval(
      () => setEstado((e) => (e.fase === "generando" ? { fase: "generando", segundos: e.segundos + 1 } : e)),
      1000,
    );
    return () => clearInterval(reloj);
  }, [generando]);

  async function generar() {
    const ctl = new AbortController();
    setCorte(ctl);
    setEstado({ fase: "generando", segundos: 0 });
    try {
      const b = await bajarArchivo(url, { signal: ctl.signal, porDefecto: "informe-agrovoltaic-sc.xlsx" });
      const sinLectura = conLectura && b.cabeceras.get(CABECERA_LECTURA) === SIN_LECTURA;
      setEstado({ fase: "listo", archivo: b.archivo, sinLectura });
    } catch (e: any) {
      setEstado(e?.name === "AbortError" ? { fase: "quieto" } : { fase: "error", motivo: String(e?.message || e) });
    } finally {
      setCorte(null);
    }
  }

  if (estado.fase === "generando") {
    return (
      <>
        <button className="btn dl-btn" disabled>Generando… {estado.segundos} s</button>
        <button className={`btn ghost sm ${estilos.ancho}`} onClick={() => corte?.abort()}>Cancelar</button>
        {conLectura && <p className={`muted small ${estilos.nota}`}>El agente redacta la lectura: suele tardar menos de un minuto.</p>}
      </>
    );
  }
  return (
    <>
      <button className="btn dl-btn" disabled={deshabilitado} onClick={generar}>{etiqueta}</button>
      {estado.fase === "error" && <div className={`alert ${estilos.nota}`}>No se pudo generar: {estado.motivo}</div>}
      {estado.fase === "listo" && <p className={`muted small mono ${estilos.nota}`}>listo · {estado.archivo}</p>}
      {estado.fase === "listo" && estado.sinLectura && (
        <div className={`alert ${estilos.nota}`}>Salió sin lectura. El motivo está en la hoja Resumen.</div>
      )}
    </>
  );
}

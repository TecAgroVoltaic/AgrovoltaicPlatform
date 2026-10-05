"use client";
// Informe del periodo en Excel: las tablas ya calculadas (diario, mensual,
// disponibilidad, calidad) y, si se pide, la lectura redactada por el agente.
// Usa el mismo rango que el paso «Rango» de Descargas; acá no se calcula nada.
import { useState } from "react";
import { BotonInforme } from "./BotonInforme";
import estilos from "./informe.module.css";

const MAX_FOCO = 300;
const RUTA = "/api/historico/informe";

export function urlInforme(desde: string, hasta: string, foco: string, conLectura: boolean): string {
  const q = new URLSearchParams({ desde, hasta });
  if (conLectura && foco.trim()) q.set("foco", foco.trim());
  if (!conLectura) q.set("lectura", "false");
  return `${RUTA}?${q.toString()}`;
}

export function InformeExcel({ desde, hasta }: { desde: string; hasta: string }) {
  const [conLectura, setConLectura] = useState(true);
  const [foco, setFoco] = useState("");
  const hayRango = !!desde && !!hasta && desde <= hasta;

  return (
    <details className={`card ${estilos.tarjeta}`}>
      <summary className={estilos.titulo}>
        Informe del periodo
        <span className="muted small mono">{hayRango ? `${desde} → ${hasta}` : "sin rango"}</span>
      </summary>
      <p className={`muted small ${estilos.nota}`} title="Hojas: Resumen, Diario, Mensual, Disponibilidad, Calidad, Gráficos y Método">
        Un Excel con el día a día, el PR por arreglo, las paradas y la calidad del dato.
      </p>
      <label className={estilos.opcion}>
        <input type="checkbox" checked={conLectura} onChange={(e) => setConLectura(e.target.checked)} />
        Con lectura del agente
      </label>
      {conLectura && (
        <input className={`input sm ${estilos.ancho}`} value={foco} maxLength={MAX_FOCO} aria-label="Foco de la lectura"
               placeholder="Foco (opcional): disponibilidad del inversor…" onChange={(e) => setFoco(e.target.value)} />
      )}
      <BotonInforme url={hayRango ? urlInforme(desde, hasta, foco, conLectura) : RUTA}
                    conLectura={conLectura} deshabilitado={!hayRango} />
      {!hayRango && <p className={`muted small ${estilos.nota}`}>Elegí un rango en el paso «Rango».</p>}
    </details>
  );
}

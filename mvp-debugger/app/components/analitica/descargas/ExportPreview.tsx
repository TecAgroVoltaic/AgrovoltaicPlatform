"use client";
// Vista previa plegable: las primeras filas tal como saldrían en el archivo.
import { useState } from "react";

import type { ExportPreviewData } from "./types";

export function ExportPreview({ preview }: { readonly preview: ExportPreviewData | null }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <button className="btn ghost sm" style={{ width: "100%", marginTop: 8 }} onClick={() => setVisible(!visible)} disabled={!preview?.filas.length}>
        {visible ? "Ocultar vista previa" : `Vista previa (${preview?.filas.length ?? 0} filas)`}
      </button>
      {visible && preview && preview.filas.length > 0 && (
        <div className="scroll" style={{ marginTop: 10 }}>
          <table className="data prev">
            <thead><tr>{preview.columnas.map((c) => <th key={c} className="lead">{c}</th>)}</tr></thead>
            <tbody>{preview.filas.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j} className="lead">{value === "" ? <span className="muted">·</span> : value}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

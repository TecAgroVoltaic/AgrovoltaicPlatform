import { nfmt } from "@/app/lib/client";
import type { Rel } from "./types";

const LARGO_FECHA_HORA = 16;

export function RelationsTable({ rels, sel, onElegir }: {
  rels: Rel[];
  sel: string;
  onElegir: (clave: string) => void;
}) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>relación</th>
          <th>filas</th>
          <th>desde</th>
          <th>hasta</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rels.map((r) => (
          <tr key={r.clave} className={sel === r.clave ? "sel" : ""}>
            <td>
              <b>{r.clave}</b>
              <div className="muted small">{r.relacion}</div>
            </td>
            <td>{nfmt(r.filas, 0)}</td>
            <td className="small">{r.desde?.slice(0, LARGO_FECHA_HORA) ?? "—"}</td>
            <td className="small">{r.hasta?.slice(0, LARGO_FECHA_HORA) ?? "—"}</td>
            <td>
              <button className="btn-sm" onClick={() => onElegir(r.clave)}>
                explorar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

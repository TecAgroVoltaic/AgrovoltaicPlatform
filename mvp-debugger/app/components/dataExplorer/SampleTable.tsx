import type { Muestra } from "./types";

const LARGO_MAXIMO_CELDA = 24;
const DECIMALES_CELDA = 3;

export function SampleTable({ muestra }: { muestra: Muestra }) {
  return (
    <>
      <h4>últimas filas</h4>
      <div className="tbl-scroll">
        <table className="tbl mono small">
          <thead>
            <tr>
              {muestra.columnas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {muestra.filas.map((f, i) => (
              <tr key={i}>
                {muestra.columnas.map((c) => (
                  <td key={c}>{fmtCell(f[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("es-CR", { maximumFractionDigits: DECIMALES_CELDA });
  const s = String(v);
  return s.length > LARGO_MAXIMO_CELDA ? s.slice(0, LARGO_MAXIMO_CELDA) + "…" : s;
}

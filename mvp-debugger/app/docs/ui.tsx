"use client";
// Primitivas de presentación para la sección de documentación. Sin estado propio;
// la navegación se hace por hash (#id-de-seccion) — los enlaces son <a href="#id">
// y el shell (DocsShell) escucha `hashchange` para cambiar la página activa.
import type { ReactNode } from "react";

// Página: envuelve el patrón migaja + título + entradilla + cuerpo.
export function Page({ crumb, title, lead, children }: {
  crumb: string; title: string; lead?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <div className="dx-crumb">Referencia <span>›</span> {crumb}</div>
      <h1 className="dx-h1">{title}</h1>
      {lead && <p className="dx-lead">{lead}</p>}
      {children}
    </>
  );
}

// Código en línea.
export function IC({ children }: { children: ReactNode }) {
  return <code className="ic">{children}</code>;
}

// Bloque de código (texto plano, monoespaciado).
export function Pre({ children }: { children: ReactNode }) {
  return <pre className="dx-pre">{children}</pre>;
}

// Diagrama ASCII.
export function Diagram({ children }: { children: ReactNode }) {
  return <div className="dx-diagram">{children}</div>;
}

// Llamado / nota. kind: info (def) | warn | good | crit.
export function Note({ kind = "info", children }: { kind?: "info" | "warn" | "good" | "crit"; children: ReactNode }) {
  return <div className={"dx-note" + (kind === "info" ? "" : " " + kind)}>{children}</div>;
}

// Tabla. head = encabezados; rows = filas (cada celda es ReactNode).
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="dx-tblwrap">
      <table className="dx-tbl">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Fila de datos clave como pills.
export function Meta({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="dx-meta">
      {items.map(([k, v], i) => <span className="pill" key={i}>{k} <b>{v}</b></span>)}
    </div>
  );
}

// Tarjetas de navegación (overview). Cada una salta a #id vía anchor.
export function Cards({ items }: { items: { id: string; title: string; desc: string }[] }) {
  return (
    <div className="dx-cards">
      {items.map((c) => (
        <a className="dx-card" key={c.id} href={"#" + c.id}>
          <h4>{c.title}</h4>
          <p>{c.desc}</p>
        </a>
      ))}
    </div>
  );
}

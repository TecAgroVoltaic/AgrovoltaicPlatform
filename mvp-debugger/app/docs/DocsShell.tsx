"use client";
// Shell de la documentación: sidebar agrupado + contenido, con navegación por hash
// (#id-de-seccion) para deep-links, tema claro/oscuro persistido y sidebar responsive.
import "./docs.css";
import { useEffect, useState } from "react";
import { GROUPS, BY_ID, ORDER, DEFAULT_ID } from "./registry";

function hashId(): string {
  const h = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  return BY_ID[h] ? h : DEFAULT_ID;
}

export function DocsShell() {
  const [active, setActive] = useState(DEFAULT_ID);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("");

  // Tema: aplicar + persistir en localStorage (independiente de la consola).
  useEffect(() => {
    const saved = localStorage.getItem("agrov-docs-theme") || "";
    if (saved) { setTheme(saved); }
  }, []);
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  // Sincronizar con el hash (deep-link + back/forward del browser).
  useEffect(() => {
    setActive(hashId());
    const onHash = () => setActive(hashId());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Al cambiar de sección: scroll arriba y cerrar el sidebar móvil.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setOpen(false);
  }, [active]);

  function toggleTheme() {
    const eff = theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = eff === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("agrov-docs-theme", next);
  }

  const sec = BY_ID[active] || BY_ID[DEFAULT_ID];
  const Comp = sec.Comp;
  const idx = ORDER.findIndex((s) => s.id === sec.id);
  const prev = idx > 0 ? ORDER[idx - 1] : null;
  const next = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;

  return (
    <div className="dx-app">
      <div className="dx-topbar">
        <button className="dx-burger" onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
        <b>{sec.title}</b>
      </div>

      {open && <div className="dx-scrim" onClick={() => setOpen(false)} />}

      <aside className={"dx-side" + (open ? " open" : "")}>
        <div className="dx-side-head">
          <div className="dx-brand">
            <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
              <g stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round">
                <path d="M20 4v4M20 32v4M4 20h4M32 20h4M9 9l3 3M28 28l3 3M31 9l-3 3M12 28l-3 3" />
              </g>
            </svg>
            <div><b>AgroVoltaic</b><div className="sub">documentación</div></div>
          </div>
          <a className="dx-back" href="/">← volver a la consola</a>
        </div>

        <nav className="dx-nav">
          {GROUPS.map((g) => (
            <div className="dx-group" key={g.label}>
              <div className="dx-group-lbl">{g.label}</div>
              {g.items.map((s) => (
                <a key={s.id} href={"#" + s.id} className={"dx-item" + (s.id === active ? " on" : "")}>{s.title}</a>
              ))}
            </div>
          ))}
        </nav>

        <div className="dx-side-foot">
          <span className="lbl">tema</span>
          <button className="dx-tgl" onClick={toggleTheme} title="Cambiar tema" aria-label="Cambiar tema">◐</button>
        </div>
      </aside>

      <main className="dx-content">
        <article className="dx-page">
          <Comp />
          <div className="dx-nextprev">
            {prev
              ? <a className="dx-np" href={"#" + prev.id}><div className="d">← anterior</div><div className="t">{prev.title}</div></a>
              : <span />}
            {next
              ? <a className="dx-np next" href={"#" + next.id}><div className="d">siguiente →</div><div className="t">{next.title}</div></a>
              : <span />}
          </div>
        </article>
      </main>
    </div>
  );
}

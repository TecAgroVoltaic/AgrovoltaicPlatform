"use client";
// Descargas: exportar un rango de fechas de un dataset (Supabase PV o API de
// AgroDash) como CSV, DAT o MAT. Diseño compacto: un ACORDEÓN de pasos a la
// izquierda (un paso abierto a la vez; los cerrados resumen su valor en una
// línea) y un panel fijo a la derecha con estimación, vista previa plegable y
// el botón. Las listas largas (cajas, tipos, columnas) usan un selector con
// búsqueda y paginación (`Picker`). La descarga es un GET directo al proxy.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { jget, mensajeError, type Resp } from "@/app/lib/client";
import { Estado } from "@/app/components/console/Estado";

type Columna = { nombre: string; tipo: string };
type Dataset = {
  clave: string; fuente: string; titulo: string; descripcion: string; relacion: string;
  columna_tiempo: string | null; columnas: Columna[]; filtros: string[];
  desde: string | null; hasta: string | null; via: string; pasos: number[];
};
type Caja = { caja: string; sensor_tipo: string; sensores: number };
type Fuente = {
  clave: string; titulo: string; descripcion: string; disponible: boolean; motivo: string | null;
  datasets: Dataset[]; cajas?: Caja[];
};
type Catalogo = { fuentes: Fuente[]; max_filas_mat: number; zona_horaria: string; nota_horas: string };
type Estimacion = { filas: number; primero: string | null; ultimo: string | null; cota?: boolean; sensores?: number };
type Previa = { columnas: string[]; filas: string[][] };
type PasoId = "fuente" | "datos" | "filtros" | "rango" | "formato" | "columnas";

const FORMATOS: { k: string; l: string; d: string }[] = [
  { k: "csv", l: "CSV", d: "coma · nulo vacío · Excel, pandas, R" },
  { k: "dat", l: "DAT", d: "tabulado · NaN · columna *_unix · MATLAB, numpy" },
  { k: "mat", l: "MAT", d: "MATLAB · variable por columna · *_unix, *_datenum, meta" },
];
const DATASET_INICIAL = "electrico_corregido";
const PASO_LABEL: Record<number, string> = { 0: "Crudo", 60: "1 min", 300: "5 min", 900: "15 min", 3600: "1 h", 86400: "1 día" };
const DEBOUNCE_MS = 400;
const PREVIA_N = 5;

const dia = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : "");
const hoy = () => new Date().toISOString().slice(0, 10);
const sumarDias = (ymd: string, n: number) => {
  const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const nf = (n: number) => n.toLocaleString("es-CR");
const mb = (bytes: number) => bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} kB` : `${(bytes / 1e6).toLocaleString("es-CR", { maximumFractionDigits: 1 })} MB`;
const hora = (s: string | null | undefined) => (s ? String(s).slice(0, 16).replace("T", " ") : "—");
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase();
const resumenLista = (s: Set<string>, todo: string) => s.size === 0 ? todo : s.size <= 2 ? [...s].join(", ") : `${s.size} seleccionadas`;

// ── Paso del acordeón ─────────────────────────────────────────────────────────
function Paso({ n, titulo, resumen, abierto, onToggle, children }:
  { n: number; titulo: string; resumen: ReactNode; abierto: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={"acc" + (abierto ? " open" : "")}>
      <button className="acc-h" onClick={onToggle} aria-expanded={abierto}>
        <span className="stepn">{n}</span>
        <span className="acc-t">{titulo}</span>
        <span className="acc-sum">{resumen}</span>
        <span className="acc-chev" aria-hidden="true">{abierto ? "−" : "+"}</span>
      </button>
      {abierto && <div className="acc-b">{children}</div>}
    </div>
  );
}

// ── Selector con búsqueda + paginación (multi) ────────────────────────────────
type Item = { k: string; label: string; meta?: string };
function Picker({ items, selected, onToggle, onClear, pageSize = 12, placeholder, fixed, vacioEs }:
  { items: Item[]; selected: Set<string>; onToggle: (k: string) => void; onClear?: () => void;
    pageSize?: number; placeholder: string; fixed?: Set<string>; vacioEs: string }) {
  const [q, setQ] = useState("");
  const [pag, setPag] = useState(0);
  const ql = q.trim().toLowerCase();
  const filt = ql ? items.filter((i) => i.label.toLowerCase().includes(ql)) : items;
  const paginas = Math.max(1, Math.ceil(filt.length / pageSize));
  const p = Math.min(pag, paginas - 1);
  const vis = filt.slice(p * pageSize, (p + 1) * pageSize);
  const sel = [...selected];
  return (
    <div className="picker">
      <div className="picker-top">
        <input className="input sm" type="search" placeholder={placeholder} value={q} onChange={(e) => { setQ(e.target.value); setPag(0); }} aria-label={placeholder} />
        <span className="muted small mono">{selected.size ? `${selected.size} de ${items.length}` : `${vacioEs} (${items.length})`}</span>
        {onClear && <button className="btn ghost sm" disabled={!selected.size} onClick={onClear}>Limpiar</button>}
      </div>
      {sel.length > 0 && sel.length <= 8 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {sel.map((k) => <button key={k} className="chip sm on" onClick={() => onToggle(k)} title="Quitar">{items.find((i) => i.k === k)?.label ?? k} ×</button>)}
        </div>
      )}
      <div className="picker-list">
        {vis.map((i) => {
          const fijo = fixed?.has(i.k);
          const on = fijo || selected.has(i.k);
          return (
            <button key={i.k} className={"pick" + (on ? " on" : "") + (fijo ? " fixed" : "")} disabled={fijo} onClick={() => onToggle(i.k)} title={i.meta}>
              <span className={"box" + (on ? " on" : "")} aria-hidden="true" />
              <span className="pick-l">{i.label}</span>
              {i.meta && <span className="pick-m mono">{i.meta}</span>}
            </button>
          );
        })}
        {!vis.length && <span className="muted small">sin coincidencias</span>}
      </div>
      {paginas > 1 && (
        <div className="pager">
          <button className="btn ghost sm" disabled={p === 0} onClick={() => setPag(p - 1)}>‹</button>
          <span className="muted small mono">{p + 1} / {paginas}</span>
          <button className="btn ghost sm" disabled={p >= paginas - 1} onClick={() => setPag(p + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

export function DescargasView() {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [errCat, setErrCat] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [abierto, setAbierto] = useState<PasoId | null>("datos");

  const [fuente, setFuente] = useState("supabase");
  const [tabla, setTabla] = useState(DATASET_INICIAL);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [formato, setFormato] = useState("csv");
  const [cols, setCols] = useState<Set<string> | null>(null);   // null = todas
  const [cajas, setCajas] = useState<Set<string>>(new Set());     // vacío = todas
  const [tipos, setTipos] = useState<Set<string>>(new Set());
  const [paso, setPaso] = useState(0);
  const [verPrevia, setVerPrevia] = useState(false);
  // Descarga con feedback: fetch + lectura por stream (bytes recibidos) + cancelar.
  // Un <a download> no avisa nada mientras el servidor arma el archivo (un .mat
  // grande o AgroDash en crudo pueden tardar minutos) y esconde los errores.
  const [dl, setDl] = useState<{ estado: "idle" | "bajando" | "error" | "ok"; bytes: number; msg?: string }>({ estado: "idle", bytes: 0 });
  const [abortar, setAbortar] = useState<AbortController | null>(null);

  const [est, setEst] = useState<Estimacion | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [errEst, setErrEst] = useState<string | null>(null);
  const [estimando, setEstimando] = useState(false);

  useEffect(() => {
    setErrCat(null); setCat(null);
    jget("/api/analizador/datos/exportables").then((r: Resp) => {
      if (!r.ok || !Array.isArray(r.data?.fuentes)) { setErrCat(r.ok ? 'respuesta inesperada: falta "fuentes"' : mensajeError(r)); return; }
      const c: Catalogo = r.data;
      setCat(c);
      const f = c.fuentes.find((x) => x.clave === "supabase" && x.disponible) || c.fuentes.find((x) => x.disponible) || c.fuentes[0];
      if (f) {
        const ds = f.datasets.find((d) => d.clave === DATASET_INICIAL) || f.datasets[0];
        setFuente(f.clave);
        if (ds) { setTabla(ds.clave); rangoInicial(ds); }
      }
    }).catch((e) => setErrCat(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  const fte = useMemo(() => cat?.fuentes.find((f) => f.clave === fuente) || null, [cat, fuente]);
  const ds = useMemo(() => fte?.datasets.find((d) => d.clave === tabla) || null, [fte, tabla]);
  const conTiempo = !!ds?.columna_tiempo;
  const conFiltros = (ds?.filtros?.length ?? 0) > 0 && !!fte?.cajas?.length;
  const conPaso = (ds?.pasos?.length ?? 0) > 0;
  const cobIni = dia(ds?.desde), cobFin = dia(ds?.hasta);

  function setDesdeSeguro(v: string) { setDesde(v); if (v && hasta && hasta < v) setHasta(v); }
  function setHastaSeguro(v: string) { setHasta(v); if (v && desde && v < desde) setDesde(v); }
  function rangoInicial(d: Dataset) {
    const fin = dia(d.hasta) || hoy();
    const ini = dia(d.desde) || sumarDias(fin, -365);
    const d30 = sumarDias(fin, -30);
    setDesde(d30 < ini ? ini : d30); setHasta(fin);
  }
  function preset(p: "semana" | "mes" | "trimestre" | "anio" | "todo") {
    const fin = cobFin || hoy(), ini = cobIni || sumarDias(fin, -3650);
    if (p === "todo") { setDesde(ini); setHasta(fin); return; }
    const n = p === "semana" ? 7 : p === "mes" ? 30 : p === "trimestre" ? 91 : 365;
    setDesde(sumarDias(fin, -n) < ini ? ini : sumarDias(fin, -n)); setHasta(fin);
  }
  function reset() { setCols(null); setCajas(new Set()); setTipos(new Set()); setPaso(0); setEst(null); setPrevia(null); setErrEst(null); }
  function elegirFuente(clave: string) {
    const f = cat?.fuentes.find((x) => x.clave === clave);
    if (!f || !f.disponible) return;
    setFuente(clave); reset();
    const d = f.datasets[0];
    if (d) { setTabla(d.clave); rangoInicial(d); }
    setAbierto("datos");
  }
  function elegirDataset(clave: string) {
    const d = fte?.datasets.find((x) => x.clave === clave);
    if (!d) return;
    setTabla(clave); reset(); rangoInicial(d);
    setAbierto(d.filtros.length && fte?.cajas?.length ? "filtros" : "rango");
  }
  const toggle = (set: Set<string>, v: string) => { const s = new Set(set); if (s.has(v)) s.delete(v); else s.add(v); return s; };

  const columnasTodas = ds?.columnas ?? [];
  const tcol = ds?.columna_tiempo ?? null;
  const seleccion = cols ? columnasTodas.filter((c) => cols.has(c.nombre) || c.nombre === tcol) : columnasTodas;
  const colsSel = useMemo(() => new Set(seleccion.map((c) => c.nombre)), [seleccion]);
  function toggleCol(nombre: string) {
    if (nombre === tcol) return;
    const base = cols ? new Set(cols) : new Set(columnasTodas.map((c) => c.nombre));
    if (base.has(nombre)) base.delete(nombre); else base.add(nombre);
    const sinTiempo = columnasTodas.filter((c) => c.nombre !== tcol).length;
    const marcadas = [...base].filter((n) => n !== tcol).length;
    setCols(marcadas >= sinTiempo ? null : base);
  }

  const params = useMemo(() => {
    const p = new URLSearchParams({ fuente, tabla });
    if (conTiempo) { p.set("desde", desde); p.set("hasta", hasta); }
    if (cajas.size) p.set("caja", [...cajas].join(","));
    if (tipos.size) p.set("sensor_tipo", [...tipos].join(","));
    if (conPaso && paso) p.set("paso", String(paso));
    return p;
  }, [fuente, tabla, conTiempo, desde, hasta, cajas, tipos, conPaso, paso]);
  const colsParam = cols ? seleccion.map((c) => c.nombre).join(",") : "";

  useEffect(() => {
    if (!ds) return;
    if (conTiempo && (!desde || !hasta)) { setEst(null); setPrevia(null); return; }
    setEstimando(true); setErrEst(null);
    const id = setTimeout(() => {
      const qp = new URLSearchParams(params); qp.set("n", String(PREVIA_N)); if (colsParam) qp.set("columnas", colsParam);
      Promise.all([
        jget(`/api/analizador/datos/exportar/estimar?${params.toString()}`),
        jget(`/api/analizador/datos/exportar/previa?${qp.toString()}`),
      ]).then(([e, p]: Resp[]) => {
        if (!e.ok || typeof e.data?.filas !== "number") { setEst(null); setPrevia(null); setErrEst(e.ok ? "respuesta inesperada" : mensajeError(e)); return; }
        setEst(e.data);
        setPrevia(p.ok && Array.isArray(p.data?.filas) ? p.data : null);
      }).catch((e) => setErrEst(String(e?.message || e))).finally(() => setEstimando(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [ds, conTiempo, desde, hasta, params, colsParam]);

  const filas = est?.filas ?? 0;
  const maxMat = cat?.max_filas_mat ?? Infinity;
  const excedeMat = formato === "mat" && filas > maxMat;
  const nCols = seleccion.length + (formato === "csv" ? 0 : 1);
  const tamano = filas * nCols * (formato === "mat" ? 5 : 9);
  const rangoInvalido = conTiempo && !!desde && !!hasta && hasta < desde;
  const listo = !!ds && !errEst && !estimando && !rangoInvalido && filas > 0 && !excedeMat;

  const qdl = new URLSearchParams(params); qdl.set("formato", formato); if (colsParam) qdl.set("columnas", colsParam);
  const url = `/api/analizador/datos/exportar?${qdl.toString()}`;

  async function descargar() {
    const ctl = new AbortController();
    setAbortar(ctl); setDl({ estado: "bajando", bytes: 0 });
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.detail || d?.error || `el servicio respondió ${r.status}`);
      }
      const partes: BlobPart[] = [];
      let bytes = 0;
      if (r.body) {
        const reader = r.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) { partes.push(value); bytes += value.byteLength; setDl({ estado: "bajando", bytes }); }
        }
      } else {
        const b = await r.blob(); partes.push(b); bytes = b.size;
      }
      const tipo = r.headers.get("content-type") || "application/octet-stream";
      const cd = r.headers.get("content-disposition") || "";
      const m = /filename="?([^";]+)"?/.exec(cd);
      const archivo = m ? m[1] : nombre;
      const href = URL.createObjectURL(new Blob(partes, { type: tipo }));
      const a = document.createElement("a"); a.href = href; a.download = archivo; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setDl({ estado: "ok", bytes, msg: archivo });
    } catch (e: any) {
      if (e?.name === "AbortError") setDl({ estado: "idle", bytes: 0 });
      else setDl({ estado: "error", bytes: 0, msg: String(e?.message || e) });
    } finally {
      setAbortar(null);
    }
  }
  const nombre = (() => {
    const partes = fuente === "supabase" ? [tabla] : [fuente, tabla];
    if (cajas.size) partes.push(cajas.size <= 2 ? slug([...cajas].join("_")) : `${cajas.size}-cajas`);
    if (conTiempo) partes.push(desde, hasta);
    return partes.join("_") + "." + formato;
  })();

  const barra = (() => {
    if (!conTiempo || !cobIni || !cobFin || !desde || !hasta) return null;
    const total = Math.max(1, diasEntre(cobIni, cobFin));
    const a = Math.min(1, Math.max(0, diasEntre(cobIni, desde) / total));
    const b = Math.min(1, Math.max(0, (diasEntre(cobIni, hasta) + 1) / total));
    return { left: a * 100, width: Math.max(0.6, (b - a) * 100), fuera: desde < cobIni || hasta > cobFin };
  })();

  const cajasItems: Item[] = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (fte?.cajas ?? []).forEach((c) => m.set(c.caja, (m.get(c.caja) ?? new Set()).add(c.sensor_tipo)));
    return [...m.entries()].map(([caja, t]) => ({ k: caja, label: caja, meta: `${t.size} tipos` }));
  }, [fte]);
  const tiposItems: Item[] = useMemo(() => {
    const m = new Map<string, number>();
    (fte?.cajas ?? []).forEach((c) => m.set(c.sensor_tipo, (m.get(c.sensor_tipo) ?? 0) + c.sensores));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, n]) => ({ k: t, label: t, meta: `${n} sensores` }));
  }, [fte]);
  const colItems: Item[] = columnasTodas.map((c) => ({ k: c.nombre, label: c.nombre, meta: c.tipo.replace(" without time zone", "").replace(" with time zone", "tz").replace("double precision", "double") }));
  const fijas = useMemo(() => new Set(tcol ? [tcol] : []), [tcol]);

  const tog = (id: PasoId) => setAbierto(abierto === id ? null : id);
  let n = 0;

  return (
    <section>
      <div className="phead">
        <h1>Descargas</h1>
        <p>Un rango de fechas → un archivo. Supabase PV o API de AgroDash · CSV, DAT o MAT · solo lectura · hora local (UTC−6).</p>
      </div>

      {!cat ? (
        <div className="card" style={{ marginTop: 22 }}>
          <Estado cargando={!errCat} error={errCat} que="el catálogo de datos" onReintentar={() => setIntento((i) => i + 1)} />
        </div>
      ) : (
        <div className="dl">
          <div className="dl-main">
            <Paso n={++n} titulo="Fuente" abierto={abierto === "fuente"} onToggle={() => tog("fuente")}
                  resumen={fte?.titulo ?? "—"}>
              <div className="seg">
                {cat.fuentes.map((f) => (
                  <button key={f.clave} className={"segbtn" + (f.clave === fuente ? " on" : "") + (f.disponible ? "" : " off")}
                          onClick={() => elegirFuente(f.clave)} disabled={!f.disponible} title={f.disponible ? f.descripcion : `No disponible · ${f.motivo}`}>
                    <span className="segt"><span className={"dot " + (f.disponible ? "ok" : "bad")} />{f.titulo}</span>
                    <span className="segd">{f.disponible ? `${f.datasets.length} conjuntos de datos` : "no disponible"}</span>
                  </button>
                ))}
              </div>
            </Paso>

            <Paso n={++n} titulo="Datos" abierto={abierto === "datos"} onToggle={() => tog("datos")}
                  resumen={ds ? <>{ds.titulo} <span className="muted">· {ds.columnas.length} col.</span></> : "—"}>
              <div className="optlist">
                {(fte?.datasets ?? []).map((d) => (
                  <button key={d.clave} className={"opt row" + (d.clave === tabla ? " on" : "")} onClick={() => elegirDataset(d.clave)} title={d.descripcion}>
                    <span className="optt">{d.titulo}</span>
                    <span className="optm mono">{d.columnas.length} col. · {d.columna_tiempo ? `hasta ${dia(d.hasta) || "?"}` : "sin fechas"}</span>
                  </button>
                ))}
              </div>
              {ds?.descripcion && <p className="muted small" style={{ margin: "10px 0 0" }}>{ds.descripcion}</p>}
            </Paso>

            {conFiltros && (
              <Paso n={++n} titulo="Filtros" abierto={abierto === "filtros"} onToggle={() => tog("filtros")}
                    resumen={<>{resumenLista(cajas, "todas las cajas")} <span className="muted">·</span> {resumenLista(tipos, "todos los tipos")}{conPaso && <><span className="muted"> ·</span> {PASO_LABEL[paso]}</>}</>}>
                <div className="lbl" style={{ marginBottom: 6 }}>Cajas</div>
                <Picker items={cajasItems} selected={cajas} onToggle={(k) => setCajas(toggle(cajas, k))} onClear={() => setCajas(new Set())} placeholder="Buscar caja…" vacioEs="todas" />
                <div className="lbl" style={{ margin: "14px 0 6px" }}>Tipos de sensor</div>
                <Picker items={tiposItems} selected={tipos} onToggle={(k) => setTipos(toggle(tipos, k))} onClear={() => setTipos(new Set())} placeholder="Buscar tipo…" vacioEs="todos" />
                {conPaso && (
                  <>
                    <div className="lbl" style={{ margin: "14px 0 6px" }}>Resolución</div>
                    <div className="chips">
                      {(ds?.pasos ?? []).map((p) => (
                        <button key={p} className={"chip sm" + (p === paso ? " on" : "")} onClick={() => setPaso(p)}>{PASO_LABEL[p] ?? `${p} s`}</button>
                      ))}
                    </div>
                    <p className="muted small" style={{ margin: "8px 0 0" }}>
                      {paso === 0 ? "Una fila por lectura. Lento en rangos largos con muchos sensores." : `Promedio por intervalo y sensor (+ n, mínimo, máximo, desvío).`}
                    </p>
                  </>
                )}
              </Paso>
            )}

            <Paso n={++n} titulo="Rango" abierto={abierto === "rango"} onToggle={() => tog("rango")}
                  resumen={conTiempo ? <span className="mono">{desde || "?"} → {hasta || "?"}{desde && hasta && !rangoInvalido ? <span className="muted"> · {nf(diasEntre(desde, hasta) + 1)} días</span> : null}</span> : <span className="muted">tabla completa</span>}>
              {conTiempo ? (
                <>
                  <div className="dl-dates">
                    <label className="ctl"><span className="lbl">Desde</span>
                      <input className="input" type="date" value={desde} min={cobIni || undefined} max={hasta || cobFin || undefined} onChange={(e) => setDesdeSeguro(e.target.value)} /></label>
                    <label className="ctl"><span className="lbl">Hasta</span>
                      <input className="input" type="date" value={hasta} min={desde || cobIni || undefined} max={cobFin || undefined} onChange={(e) => setHastaSeguro(e.target.value)} /></label>
                    <div className="chips" style={{ paddingBottom: 6 }}>
                      {([["semana", "7 días"], ["mes", "30 días"], ["trimestre", "3 meses"], ["anio", "1 año"], ["todo", "Todo"]] as const)
                        .filter(([p]) => p !== "todo" || !!cobIni)
                        .map(([p, l]) => <button key={p} className="chip sm" onClick={() => preset(p)}>{l}</button>)}
                    </div>
                  </div>
                  {barra ? (
                    <div className="range">
                      <div className="range-track"><div className={"range-sel" + (barra.fuera ? " warn" : "")} style={{ left: `${barra.left}%`, width: `${barra.width}%` }} /></div>
                      <div className="range-lbl mono"><span>{cobIni}</span><span>{cobFin}</span></div>
                    </div>
                  ) : cobFin ? <div className="muted small mono" style={{ marginTop: 10 }}>último dato: {hora(ds?.hasta)}</div> : null}
                  {rangoInvalido && <div className="alert">«Hasta» es anterior a «Desde».</div>}
                </>
              ) : <div className="muted small">Sin columna de tiempo: se descarga completa.</div>}
            </Paso>

            <Paso n={++n} titulo="Formato" abierto={abierto === "formato"} onToggle={() => tog("formato")}
                  resumen={<span className="mono">.{formato}</span>}>
              <div className="chips">
                {FORMATOS.map((f) => <button key={f.k} className={"chip" + (f.k === formato ? " on" : "")} onClick={() => setFormato(f.k)}>{f.l}</button>)}
              </div>
              <p className="muted small" style={{ margin: "8px 0 0" }}>{FORMATOS.find((f) => f.k === formato)?.d}{formato === "mat" ? ` · tope ${nf(maxMat)} filas` : ""}</p>
            </Paso>

            <Paso n={++n} titulo="Columnas" abierto={abierto === "columnas"} onToggle={() => tog("columnas")}
                  resumen={cols ? `${seleccion.length} de ${columnasTodas.length}` : <span className="muted">todas ({columnasTodas.length})</span>}>
              <Picker items={colItems} selected={colsSel} onToggle={toggleCol} onClear={cols ? () => setCols(null) : undefined}
                      placeholder="Buscar variable…" vacioEs="todas" fixed={fijas} pageSize={10} />
            </Paso>
          </div>

          <aside className="dl-side">
            <div className="card dl-sum">
              <div className="dl-file mono" title={nombre}>{nombre}</div>
              <div className="dl-est">
                {estimando ? <div className="muted loading" style={{ margin: 0 }}>estimando…</div>
                : errEst ? <div className="alert" style={{ margin: 0 }}>{errEst}</div>
                : est ? (
                  <>
                    <div className="metric"><span className="v">{est.cota ? "≈ " : ""}{nf(filas)}</span><span className="muted small">filas{est.cota ? " (estimado)" : ""} · ≈ {mb(tamano)}</span></div>
                    {filas > 0 && est.primero && <div className="muted small mono" style={{ marginTop: 4 }}>{hora(est.primero)} → {hora(est.ultimo)}</div>}
                    {est.cota && <div className="muted small" style={{ marginTop: 4 }}>{est.sensores ?? 0} sensores · la API no cuenta filas: la cifra es aproximada.</div>}
                    {filas === 0 && <div className="muted small" style={{ marginTop: 4 }}>Sin filas en este rango.</div>}
                  </>
                ) : <div className="muted small">Elegí un rango.</div>}
                {excedeMat && !errEst && <div className="alert" style={{ marginBottom: 0 }}>Supera el tope del .mat: acortá el rango o usá CSV/DAT.</div>}
              </div>
              {dl.estado === "bajando" ? (
                <>
                  <button className="btn dl-btn" disabled>Preparando… {dl.bytes ? mb(dl.bytes) + " recibidos" : "esperando al servidor"}</button>
                  <button className="btn ghost sm" style={{ width: "100%", marginTop: 8 }} onClick={() => abortar?.abort()}>Cancelar</button>
                  {dl.bytes === 0 && <p className="muted small" style={{ margin: "8px 0 0" }}>{formato === "mat" ? "El .mat se arma completo antes de enviarse: puede tardar." : "AgroDash se consulta sensor por sensor: puede tardar."}</p>}
                </>
              ) : (
                <button className="btn dl-btn" disabled={!listo} onClick={descargar}>Descargar</button>
              )}
              {dl.estado === "error" && <div className="alert" style={{ marginBottom: 0 }}>No se pudo descargar: {dl.msg}</div>}
              {dl.estado === "ok" && <p className="muted small mono" style={{ margin: "8px 0 0" }}>listo · {mb(dl.bytes)} · {dl.msg}</p>}
              <button className="btn ghost sm" style={{ width: "100%", marginTop: 8 }} onClick={() => setVerPrevia(!verPrevia)} disabled={!previa?.filas.length}>
                {verPrevia ? "Ocultar vista previa" : `Vista previa (${previa?.filas.length ?? 0} filas)`}
              </button>
              {verPrevia && previa && previa.filas.length > 0 && (
                <div className="scroll" style={{ marginTop: 10 }}>
                  <table className="data prev">
                    <thead><tr>{previa.columnas.map((c) => <th key={c} className="lead">{c}</th>)}</tr></thead>
                    <tbody>{previa.filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j} className="lead">{v === "" ? <span className="muted">·</span> : v}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

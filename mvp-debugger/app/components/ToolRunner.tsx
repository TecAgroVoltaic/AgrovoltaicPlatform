"use client";
// Runner manual de tools: llama una tool atomica directo (sin el LLM), con los
// params que vos quieras. Sirve para verificar que la tool devuelve lo correcto
// independientemente de como la use el agente.
import { useEffect, useState } from "react";
import { jget, jpost } from "@/app/lib/client";
import { Json } from "@/app/components/Json";

type Schema = { name: string; description: string; input_schema: any };

export function ToolRunner() {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [sel, setSel] = useState<string>("");
  const [params, setParams] = useState<string>("{}");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    jget<{ tools: Schema[] }>("/api/analizador/tools").then((r) => {
      if (r.ok && r.data?.tools) {
        setSchemas(r.data.tools);
        setSel(r.data.tools[0]?.name || "");
      }
    });
  }, []);

  const actual = schemas.find((s) => s.name === sel);

  async function ejecutar() {
    setErr(null);
    setRes(null);
    let body: any;
    try {
      body = JSON.parse(params || "{}");
    } catch (e: any) {
      setErr("JSON inválido en params: " + e.message);
      return;
    }
    setCargando(true);
    const r = await jpost(`/api/analizador/tool/${sel}`, body);
    setCargando(false);
    if (!r.ok) setErr(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
    else setRes(r.data);
  }

  return (
    <div className="runner">
      <div className="runner-controls">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="select">
          {schemas.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className="input mono"
          value={params}
          onChange={(e) => setParams(e.target.value)}
          placeholder='{"desde":"2026-01-01","hasta":"2026-02-01"}'
        />
        <button className="btn" onClick={ejecutar} disabled={cargando || !sel}>
          {cargando ? "…" : "Ejecutar"}
        </button>
      </div>
      {actual && <div className="muted runner-desc">{actual.description}</div>}
      {actual?.input_schema?.properties && (
        <div className="muted runner-params">
          params:{" "}
          {Object.keys(actual.input_schema.properties).length
            ? Object.keys(actual.input_schema.properties).join(", ")
            : "(ninguno)"}
        </div>
      )}
      {err && <div className="alert">{err}</div>}
      {res && <Json value={res} />}
    </div>
  );
}

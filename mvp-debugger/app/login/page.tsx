"use client";

// Formulario de acceso. Responsabilidad unica: pedir la password y postearla a
// /api/login; la validacion y la cookie son del route handler.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const RUTA_API_LOGIN = "/api/login";
const DESTINO_POR_DEFECTO = "/";

// useSearchParams() obliga a un limite de Suspense: sin el, `next build` falla
// al prerenderizar esta pagina (missing-suspense-with-csr-bailout).
export default function Login() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(RUTA_API_LOGIN, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}));
        setError(cuerpo.error || `error ${r.status}`);
        return;
      }
      router.replace(params.get("desde") || DESTINO_POR_DEFECTO);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "no se pudo conectar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 }}>
      <form className="card" onSubmit={enviar} style={{ width: 340 }}>
        <h3>Consola de evaluación</h3>
        <p className="hint">
          Acceso restringido: las consultas de esta consola consumen tokens del modelo.
        </p>
        <input
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          placeholder="Contraseña"
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            border: "1px solid var(--line2)", background: "var(--raise)",
            color: "var(--ink)", fontSize: 13,
          }}
        />
        {error && (
          <p className="small" style={{ color: "var(--crit)", margin: "10px 0 0" }}>
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={enviando || !password}
                style={{ width: "100%", marginTop: 14 }}>
          {enviando ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

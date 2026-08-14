// Login: valida la password y emite la cookie de sesion. Responsabilidad unica
// (no renderiza el formulario; eso es /login/page.tsx).
import { NextResponse } from "next/server";

import {
  COOKIE_SESION,
  DURACION_SESION_SEG,
  crearSesion,
  passwordConfigurada,
  passwordCorrecta,
} from "@/app/lib/auth";
import { esperaRestante, ipDe, registrarExito, registrarFallo } from "@/app/lib/limiteLogin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!passwordConfigurada()) {
    return NextResponse.json(
      { error: "la consola no tiene password configurada" },
      { status: 503 },
    );
  }

  // Antes de gastar CPU en verificar: si esta IP ya agotó sus intentos, corta.
  const ip = ipDe(req);
  const espera = esperaRestante(ip);
  if (espera > 0) {
    return NextResponse.json(
      { error: `demasiados intentos: probá de nuevo en ${Math.ceil(espera / 60)} min` },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  let password = "";
  try {
    password = ((await req.json()) as { password?: string }).password || "";
  } catch {
    return NextResponse.json({ error: "cuerpo invalido" }, { status: 400 });
  }

  if (!(await passwordCorrecta(password))) {
    registrarFallo(ip);
    return NextResponse.json({ error: "password incorrecta" }, { status: 401 });
  }

  registrarExito(ip);
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set({
    name: COOKIE_SESION,
    value: await crearSesion(),
    httpOnly: true,                 // el JS del browser no puede leerla
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_SESION_SEG,
  });
  return respuesta;
}

export async function DELETE() {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set({ name: COOKIE_SESION, value: "", path: "/", maxAge: 0 });
  return respuesta;
}

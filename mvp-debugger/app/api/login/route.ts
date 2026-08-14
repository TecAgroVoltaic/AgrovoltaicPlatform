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

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!passwordConfigurada()) {
    return NextResponse.json(
      { error: "la consola no tiene password configurada" },
      { status: 503 },
    );
  }

  let password = "";
  try {
    password = ((await req.json()) as { password?: string }).password || "";
  } catch {
    return NextResponse.json({ error: "cuerpo invalido" }, { status: 400 });
  }

  if (!(await passwordCorrecta(password))) {
    return NextResponse.json({ error: "password incorrecta" }, { status: 401 });
  }

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

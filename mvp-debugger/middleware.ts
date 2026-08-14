// Gate de acceso de la consola. Responsabilidad unica: decidir si un request
// pasa; no sabe firmar cookies (auth.ts) ni renderizar el login.
//
// Por que existe: la web pega a los agentes por /api/*, que gastan tokens del
// LLM. Sin gate, cualquiera con la URL gasta plata. Las paginas redirigen al
// login; las rutas /api/* responden 401 JSON (un fetch no sigue un redirect a
// HTML de forma util).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { COOKIE_SESION, ENV_PASSWORD, passwordConfigurada, sesionValida } from "@/app/lib/auth";

const RUTA_LOGIN = "/login";
const RUTA_API_LOGIN = "/api/login";
const PREFIJO_API = "/api/";

function esRutaPublica(pathname: string): boolean {
  return pathname === RUTA_LOGIN || pathname === RUTA_API_LOGIN;
}

function rechazar(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith(PREFIJO_API)) {
    return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  }
  const destino = req.nextUrl.clone();
  destino.pathname = RUTA_LOGIN;
  destino.searchParams.set("desde", req.nextUrl.pathname);
  return NextResponse.redirect(destino);
}

export async function middleware(req: NextRequest) {
  if (esRutaPublica(req.nextUrl.pathname)) return NextResponse.next();

  // Sin password configurada NO se abre la app en produccion: se corta con un
  // error de configuracion explicito. Fallar abierto es como se llego a tener
  // la consola expuesta en Amplify. En desarrollo se deja pasar para no
  // estorbar el trabajo local.
  if (!passwordConfigurada()) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: `falta ${ENV_PASSWORD}: la consola no arranca sin gate` },
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const valida = await sesionValida(req.cookies.get(COOKIE_SESION)?.value);
  return valida ? NextResponse.next() : rechazar(req);
}

export const config = {
  // Todo menos los assets de Next y el favicon. Incluye deliberadamente /api/*:
  // ahi es donde se gastan tokens.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

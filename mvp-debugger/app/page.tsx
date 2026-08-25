import { Console } from "@/app/components/console/Console";
import { historicoActivo } from "@/app/lib/agentes";

// Server component: lee el flag del entorno y lo BAJA como prop. El cliente
// nunca lee process.env, asi hay una sola fuente de verdad (ver lib/agentes).
// Render dinamico: el flag de agentes se lee del ENTORNO en cada request. Sin
// esto Next prerenderiza la pagina y congela el valor del momento del build,
// asi que cambiar la variable no cambiaria nada hasta reconstruir.
export const dynamic = "force-dynamic";

export default function Home() {
  return <Console historico={historicoActivo()} />;
}

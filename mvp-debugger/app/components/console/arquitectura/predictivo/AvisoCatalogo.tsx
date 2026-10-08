import { IconoAlerta } from "@/app/components/Iconos";
import { HERRAMIENTAS } from "../catalogo";
import type { Mapa } from "../mapa";

/**
 * Fichas del catálogo que ya no corresponden a ninguna herramienta viva, y
 * herramientas vivas sin ficha. No se dibujan distinto; se avisan. Una vista
 * que calla esto es una vista que miente.
 */
export function AvisoCatalogo({ mapa }: { mapa: Mapa }) {
  const publicadas = new Set(mapa.herramientas.map((h) => h.nombre));
  const huerfanas = Object.keys(HERRAMIENTAS).filter((n) => !publicadas.has(n));
  const sinDocumentar = mapa.herramientas.filter((h) => !HERRAMIENTAS[h.nombre]);
  if (huerfanas.length === 0 && sinDocumentar.length === 0) return null;
  return (
    <p className="arq-aviso">
      <IconoAlerta size={14} />
      {huerfanas.length > 0 && (
        <span>
          La consola documenta {huerfanas.join(", ")}, que el servicio ya no expone.
          {sinDocumentar.length > 0 ? " " : ""}
        </span>
      )}
      {sinDocumentar.length > 0 && (
        <span>
          {sinDocumentar.map((h) => h.nombre).join(", ")} corre en el servicio sin ficha
          en la consola: se dibuja con su contrato, sin explicación.
        </span>
      )}
    </p>
  );
}

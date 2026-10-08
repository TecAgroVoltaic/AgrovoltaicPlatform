import { Estado } from "@/app/components/console/Estado";
import { fmt } from "@/app/components/console/perfCatalogo";
import { scatter } from "@/app/lib/charts";
import { ajusteLineal, atipicosBajos, depurar, CONSTANTE_SOLAR, type Punto } from "@/app/lib/regresion";
import type { Periodo } from "./tipos";

const ALTO_DE_LA_NUBE = 320;
const DESCARTADOS_A_LA_VISTA = 3;
const BAJOS_A_LA_VISTA = 5;

/** Potencia PV1 frente a irradiancia, un punto por día, con su recta y los días bajos. */
export function NubeCard({ scat, P, errScat, onReintentar }: {
  scat: Punto[] | null; P: Periodo; errScat: string | null; onReintentar: () => void;
}) {
  // El ajuste sale de los puntos, no del servidor: es aritmética sobre lo que ya
  // se descargó, y hacerla acá evita un viaje y que dos sitios calculen distinto.
  const { usables, descartados } = depurar(scat || []);
  const ajuste = scat ? ajusteLineal(usables) : null;
  const bajos = ajuste ? atipicosBajos(usables, ajuste) : [];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Potencia PV1 frente a irradiancia</h3>
      <p className="hint">
        Un punto por <strong>día</strong>. La recta es el ajuste por mínimos cuadrados;
        los días marcados quedan muy por debajo.
        {ajuste ? <> · <b>R² {fmt(ajuste.r2, 2)}</b> sobre {ajuste.n} días
          {" "}· pendiente {fmt(ajuste.m, 2)} W por W/m²</> : null} · {P.label}
      </p>
      {scat && usables.length && ajuste ? (
        <>
          <figure dangerouslySetInnerHTML={{ __html: scatter(
            usables.map((p) => [p.x, p.y] as [number, number]),
            { height: ALTO_DE_LA_NUBE, xUnit: "W/m²", yUnit: "W", linea: ajuste,
              etiquetas: usables.map((p) => p.etiqueta),
              marcas: bajos.map((a) => ({
                x: a.punto.x, y: a.punto.y, etiqueta: a.punto.etiqueta,
                nota: `${fmt(a.punto.y, 0)} W con ${fmt(a.punto.x, 0)} W/m²: `
                  + `${fmt(a.faltante, 0)} W por debajo de lo esperado`,
              })) }) }} />
          {descartados.length ? (
            <p className="hint" style={{ marginTop: 10 }}>
              <b>{descartados.length} {descartados.length === 1 ? "día excluido" : "días excluidos"}</b>:
              {" "}irradiancia superior a la constante solar ({CONSTANTE_SOLAR} W/m²), dato
              inválido.{" "}
              {descartados.slice(0, DESCARTADOS_A_LA_VISTA).map((d) => `${d.etiqueta} (${fmt(d.x, 0)} W/m²)`).join(" · ")}.
            </p>
          ) : null}
          {bajos.length ? (
            <p className="hint" style={{ marginTop: 10 }}>
              <b>{bajos.length} {bajos.length === 1 ? "día" : "días"} por debajo del
              ajuste:</b>{" "}
              {bajos.slice(0, BAJOS_A_LA_VISTA).map((a) => `${a.punto.etiqueta} (−${fmt(a.faltante, 0)} W)`).join(" · ")}
              {bajos.length > BAJOS_A_LA_VISTA ? ` y ${bajos.length - BAJOS_A_LA_VISTA} más` : ""}.
            </p>
          ) : (
            <p className="hint" style={{ marginTop: 10 }}>
              Ningún día se aparta lo suficiente del ajuste.
            </p>
          )}
        </>
      ) : (
        <Estado cargando={!scat && !errScat} error={errScat}
                vacio={!!scat && !ajuste} que="la comparación con el sol"
                pista="Hacen falta al menos 3 días con irradiancia Y potencia el mismo día."
                onReintentar={onReintentar} />
      )}
    </div>
  );
}

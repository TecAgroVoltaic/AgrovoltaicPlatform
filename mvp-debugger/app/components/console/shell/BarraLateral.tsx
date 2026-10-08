import { Fragment } from "react";

import { ConsoleDrawer } from "@/app/components/console/ConsoleDrawer";
import { IconoDocs, IconoTablero } from "@/app/components/Iconos";
import { Marca } from "./Marca";
import { AGENTES, LABEL, VISTAS_AGENTE, VISTAS_FIJAS, type Icono, type View } from "./vistas";

/** La barra lateral: agente, navegación, enlaces, salud del servicio y tema. */
export function BarraLateral({ agent, view, ancha, enCajon, up, onPlegar, goAgent, goView, toggleTheme }: {
  agent: string; view: View; ancha: boolean; enCajon: boolean; up: boolean;
  onPlegar: () => void; goAgent: (a: string) => void; goView: (v: View) => void;
  toggleTheme: () => void;
}) {
  // La barra se rearma con el agente elegido: sus vistas arriba, las fijas abajo.
  const vistas: [View, string, Icono][] = [
    ...(VISTAS_AGENTE[agent] || []), ...VISTAS_FIJAS,
  ];
  return (
    <ConsoleDrawer
      titulo={LABEL[view]}
      claveActiva={`${agent}·${view}`}
      claseBarra={ancha ? "" : "compacta"}
    >
      <Marca ancha={ancha} enCajon={enCajon} onPlegar={onPlegar} />
      <div className="agent">
        {AGENTES.map((a) => (
          <button key={a.id} className={agent === a.id ? "on" : ""}
                  onClick={() => goAgent(a.id)} data-tip={`${a.nombre}: ${a.sub}`}
                  aria-pressed={agent === a.id}>
            {ancha ? a.nombre.replace("Agente ", "") : a.inicial}
          </button>
        ))}
      </div>
      <nav className="nav">
        {vistas.map(([v, l, Icono]) => (
          <Fragment key={v}>
            {v === VISTAS_FIJAS[0][0] && <div className="navsep" />}
            <button className={"navitem" + (view === v ? " on" : "")} onClick={() => goView(v)}
                    data-tip={ancha ? undefined : l} aria-label={l}>
              <Icono size={16} />
              <span className="solo-ancha">{l}</span>
            </button>
          </Fragment>
        ))}
      </nav>
      <a className="navitem" href="/" data-tip={ancha ? undefined : "Evaluación de datos"}
         aria-label="Evaluación de datos">
        <IconoTablero size={16} />
        <span className="solo-ancha">Evaluación de datos ↗</span>
      </a>
      <a className="navitem" href="/docs" data-tip={ancha ? undefined : "Documentación"}
         aria-label="Documentación">
        <IconoDocs size={16} />
        <span className="solo-ancha">Documentación ↗</span>
      </a>
      <div className="sidefoot">
        <span className="live" data-tip={ancha ? undefined : (up ? "DB en vivo" : "servicio caído")}>
          <span className={"pulse" + (up ? "" : " off")} />
          <span className="solo-ancha">{up ? "DB en vivo" : "servicio caído"}</span>
        </span>
        <button className="tgl" onClick={toggleTheme} data-tip="Cambiar tema" aria-label="Cambiar tema">◐</button>
      </div>
    </ConsoleDrawer>
  );
}

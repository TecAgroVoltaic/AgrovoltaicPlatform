// Cascarón del sistema de evaluación de datos: barra lateral con las secciones y
// selector de rango arriba del contenido.
//
// El rango vive en el cascarón y no en cada página porque acota TODO lo que se
// mira: moverlo cambia el tablero, las series y la calidad a la vez. Va envuelto
// en <Suspense> porque lee la query de la URL, que Next resuelve del lado del
// cliente.
import { Suspense } from "react";

import { BrandMark } from "@/app/components/BrandMark";
import { RangeSelector } from "@/app/components/analitica/RangeSelector";
import { SectionNav } from "@/app/components/analitica/SectionNav";
import { SidebarDrawer } from "@/app/components/analitica/SidebarDrawer";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { IconoDocs, IconoGrafo } from "@/app/components/Iconos";

// Render dinámico en toda la sección. El rango vive en la query y el selector lo
// lee con `useSearchParams`: sin esto, en las páginas prerenderizadas la barra de
// rango llegaría vacía al primer pintado y solo se completaría al hidratar, así
// que un enlace compartido se abriría un instante mostrando otro período. Estas
// pantallas consultan datos vivos y están detrás del gate de acceso: no había
// nada que cachear.
export const dynamic = "force-dynamic";

const ICON_SIZE = 16;
const SITE = "San Carlos (10,33°N · 84,42°O) · UTC−6";

// `has-drawer` avisa a la hoja global de que ESTE cascarón sí tiene botón para
// abrir la barra en pantallas angostas. /consola comparte `.app` y no lo tiene,
// así que su barra no puede volverse cajón sin quedar inalcanzable.
export default function AnalisisLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app has-drawer">
      <SidebarDrawer>
        <div className="brand">
          <BrandMark />
          <div>
            <b>AgroVoltaic</b>
            <div className="sub muted mono">evaluación de datos</div>
          </div>
        </div>

        <Suspense fallback={<div className="nav muted small">Secciones…</div>}>
          <SectionNav />
        </Suspense>

        <div className="navsep" />
        <a className="navitem" href="/consola">
          <IconoGrafo size={ICON_SIZE} />
          <span>Consola de agentes ↗</span>
        </a>
        <a className="navitem" href="/docs">
          <IconoDocs size={ICON_SIZE} />
          <span>Documentación ↗</span>
        </a>

        <div className="sidefoot">
          <span className="live mono">datos PV</span>
          <ThemeToggle />
        </div>
      </SidebarDrawer>

      <main className="content">
        <Suspense fallback={<div className="rng muted small">Cargando el rango…</div>}>
          <RangeSelector />
        </Suspense>
        {children}
        <div className="foot">
          <span>AgroVoltaic · sistema de evaluación de datos</span>
          <span>{SITE}</span>
        </div>
      </main>
    </div>
  );
}

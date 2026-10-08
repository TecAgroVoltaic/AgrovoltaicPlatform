"use client";
// Shell de la consola: barra lateral (agente + navegación + salud DB + tema) y el
// lienzo con la vista activa. Junta las vistas y colecciona el gasto de sesión.
//
// La barra ARRANCA COMPACTA (solo iconos) en cada carga, y expandirla es un gesto
// explícito que no se recuerda: lo que importa en esta consola son los datos, y
// una columna de 230 px de texto que nunca cambia les roba ancho a las gráficas.
// Compacta, el icono ES la etiqueta; el nombre completo aparece al pasar el mouse
// (`data-tip`, atendido por ChartTooltip, que ya está montado acá).
//
// Eso vale EN ESCRITORIO. En una pantalla angosta la barra se vuelve cajón y ahí
// va siempre ancha: adentro de un cajón de 284 px no hay ancho que ahorrar, y el
// mouse que mostraba los nombres no existe. Ver `useBarraEnCajon` para por qué la
// condición se evalúa en JS y no solo con una media query.
//
// Las piezas viven en `shell/`: el catálogo de agentes y vistas, la barra, la
// vista activa y los hooks de tema y salud del servicio.
import { useState } from "react";
import { ChartTooltip } from "@/app/components/ChartTooltip";
import { ChatWidget } from "@/app/components/chat/ChatWidget";
import { useBarraEnCajon } from "@/app/components/console/useBarraEnCajon";
import { BarraLateral } from "@/app/components/console/shell/BarraLateral";
import { useServicioVivo } from "@/app/components/console/shell/useServicioVivo";
import { useTema } from "@/app/components/console/shell/useTema";
import { VistaActiva } from "@/app/components/console/shell/VistaActiva";
import { AGENTES, LABEL, VISTAS_AGENTE, agenteDe, type View } from "@/app/components/console/shell/vistas";
import type { Traza } from "@/app/components/TraceViewer";

/**
 * `historico` = ¿está habilitado el Q&A del Agente Histórico? Viene del servidor
 * (lib/agentes) via app/page.tsx. Con él apagado se cae su hilo de chat y el proxy
 * responde 503 a /preguntar y /chat. Lo que NO se cae son sus vistas de calidad ni
 * su arquitectura: son deterministas, no gastan un centavo, y son justamente lo
 * que se está construyendo.
 */
export function Console({ historico = true }: { historico?: boolean }) {
  const [agent, setAgent] = useState("predictivo");
  const [view, setView] = useState<View>("pred");
  const { theme, toggleTheme } = useTema();
  const [sesion, setSesion] = useState<{ agent: string; traza: Traza }[]>([]);
  const up = useServicioVivo(agent);
  // Compacta en cada carga: expandir es deliberado y dura lo que dura la sesión
  // de pantalla, no se persiste.
  const [anchaPorPreferencia, setAnchaPorPreferencia] = useState(false);
  const enCajon = useBarraEnCajon();
  // Una sola verdad para las dos mitades del plegado. Antes el CSS escondía las
  // etiquetas con `.compacta` mientras este componente seguía escribiendo el
  // nombre del agente, así que en un teléfono convivían un menú de iconos mudos
  // con un selector en «H»/«P»: dos idiomas para la misma barra.
  const ancha = enCajon || anchaPorPreferencia;

  function goView(v: View) {
    setView(v);
    const a = agenteDe(v);
    if (a) setAgent(a);
  }
  function goAgent(a: string) {
    setAgent(a);
    // Si la vista abierta es de OTRO agente, saltar a la primera del elegido. Las
    // fijas se quedan: no son de nadie, y cambiar de agente mirando «Base de
    // datos» no debería moverte de pantalla.
    const duenio = agenteDe(view);
    if (duenio && duenio !== a) {
      const destino = VISTAS_AGENTE[a]?.[0]?.[0];
      if (destino) setView(destino);
    }
  }

  const addTraza = (ag: string, traza: Traza) => setSesion((s) => [...s, { agent: ag, traza }]);
  // El chat habla con el agente de la sección (goView ya sincroniza `agent`).
  const agenteActivo = AGENTES.find((a) => a.id === agent);
  const contexto = `${agenteActivo?.nombre ?? agent} · ${LABEL[view]}`;

  return (
    // `consola` marca a este cascarón como uno de los que tienen cajón. No reusa
    // `has-drawer` del cascarón de análisis porque esa clase además adelgaza la
    // barra a 184 px en tablet, y acá la barra ya arranca plegada a 60 px: quien
    // la ensancha lo pidió a propósito y no querría las etiquetas partidas en dos
    // renglones a cambio de 46 px.
    <div className="app consola">
      <ChartTooltip />
      <BarraLateral
        agent={agent} view={view} ancha={ancha} enCajon={enCajon} up={up}
        onPlegar={() => setAnchaPorPreferencia((a) => !a)}
        goAgent={goAgent} goView={goView} toggleTheme={toggleTheme}
      />

      <VistaActiva view={view} agent={agent} theme={theme} sesion={sesion} />

      {(agent === "predictivo" || historico) && (
        <ChatWidget agent={agent} contexto={contexto} onTraza={addTraza} />
      )}
    </div>
  );
}

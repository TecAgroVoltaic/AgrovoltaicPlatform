// Lo que protege esta prueba: que el cajón de la consola se pueda MANEJAR y que
// cierre cuando ya cumplió, no que se vea bonito.
//
// Los dos modos de fallar son invisibles en una captura: un cajón que queda
// tapando la vista que la persona acaba de pedir, y un cajón que al cerrarse deja
// el foco del teclado dentro de sí mismo, o sea en ninguna parte.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConsoleDrawer } from "@/app/components/console/ConsoleDrawer";

const ABRIR = "Abrir el menú de la consola";
const CERRAR = "Cerrar el menú";

type Vista = { titulo: string; clave: string };

const PREDICCION: Vista = { titulo: "Predicción vs Real", clave: "predictivo·pred" };
const ARQ_HISTORICO: Vista = { titulo: "Arquitectura del agente", clave: "historico·arq" };
const ARQ_PREDICTIVO: Vista = { titulo: "Arquitectura del agente", clave: "predictivo·arq" };

// Un árbol NUEVO en cada pintada: reusar la misma referencia hace que React se
// saltee el renderizado y la prueba mediría el atajo de React, no el componente.
const cascaron = (vista: Vista, claseBarra = "") => (
  <ConsoleDrawer titulo={vista.titulo} claveActiva={vista.clave} claseBarra={claseBarra}>
    <button type="button">Calidad de datos</button>
  </ConsoleDrawer>
);

function montar(vista: Vista = PREDICCION, claseBarra = "") {
  const { rerender } = render(cascaron(vista, claseBarra));
  return {
    boton: screen.getByRole("button", { name: ABRIR }),
    cajon: screen.getByRole("complementary"),
    repintar: (siguiente: Vista) => rerender(cascaron(siguiente, claseBarra)),
  };
}

describe("ConsoleDrawer", () => {
  it("anuncia el estado del cajón y a qué elemento controla", () => {
    // Given el cascarón recién pintado
    const { boton, cajon } = montar();
    expect(boton).toHaveAttribute("aria-expanded", "false");

    // When se abre el cajón
    fireEvent.click(boton);

    // Then el botón dice que está abierto y apunta al menú de verdad
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(boton.getAttribute("aria-controls")).toBe(cajon.id);
    expect(cajon.className).toContain("is-open");
  });

  it("el nombre de la vista queda visible con el cajón cerrado", () => {
    // Given el cajón cerrado, que es lo que ve un teléfono al entrar
    montar();

    // When se lee la barra superior
    const titulo = screen.getByText(PREDICCION.titulo, { selector: ".shell-title" });

    // Then dice dónde está parada la persona: es lo único que queda a la vista
    expect(titulo).toBeInTheDocument();
  });

  it("Escape cierra el cajón y devuelve el foco al botón que lo abrió", () => {
    // Given el cajón abierto, con el foco adentro
    const { boton, cajon } = montar();
    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: CERRAR })).toHaveFocus();

    // When se pulsa Escape
    fireEvent.keyDown(document, { key: "Escape" });

    // Then se cierra y el foco vuelve a un elemento visible
    expect(cajon.className).not.toContain("is-open");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton).toHaveFocus();
  });

  it("una tecla cualquiera no cierra el cajón", () => {
    // Given el cajón abierto
    const { boton, cajon } = montar();
    fireEvent.click(boton);

    // When se pulsa una tecla que no es Escape
    fireEvent.keyDown(document, { key: "a" });

    // Then sigue abierto
    expect(cajon.className).toContain("is-open");
  });

  it("elegir una vista cierra el cajón y no deja el foco adentro", () => {
    // Given el cajón abierto sobre una vista
    const { boton, cajon, repintar } = montar();
    fireEvent.click(boton);
    expect(cajon.className).toContain("is-open");

    // When la consola pasa a otra vista
    repintar(ARQ_HISTORICO);

    // Then el cajón se aparta (si no, taparía la vista que lo pidió) y el foco
    // aterriza en el botón del menú: acá no hay cambio de página que lo reubique
    // solo, y el botón recién pulsado quedó dentro de un cajón invisible.
    expect(cajon.className).not.toContain("is-open");
    expect(boton).toHaveFocus();
  });

  it("cambiar de agente sobre «Arquitectura» también cierra, aunque el título no cambie", () => {
    // Given el cajón abierto en la arquitectura del Histórico
    const { boton, cajon, repintar } = montar(ARQ_HISTORICO);
    fireEvent.click(boton);

    // When se pasa a la arquitectura del Predictivo, que se llama IGUAL
    repintar(ARQ_PREDICTIVO);

    // Then igual se cierra: mirar solo el título dejaba el menú encima de la
    // única vista que dos agentes comparten de nombre
    expect(cajon.className).not.toContain("is-open");
  });

  it("con el cajón cerrado, cambiar de vista no le roba el foco a la página", () => {
    // Given el cascarón en escritorio, donde el cajón nunca se abrió
    const { boton, repintar } = montar();
    const afuera = document.createElement("button");
    document.body.appendChild(afuera);
    afuera.focus();

    // When la consola cambia de vista
    repintar(ARQ_HISTORICO);

    // Then el foco se queda donde estaba: mover el foco de quien no abrió nada
    // es un salto que nadie pidió
    expect(afuera).toHaveFocus();
    expect(boton).not.toHaveFocus();
    afuera.remove();
  });

  it("el modificador de la barra viaja hasta el elemento que lo usa", () => {
    // Given la barra plegada en escritorio
    const { cajon } = montar(PREDICCION, "compacta");

    // When se mira la clase del cajón
    // Then lleva el modificador junto a las clases del cascarón compartido: sin
    // eso, plegar en escritorio deja de funcionar al pasar por este componente
    expect(cajon.className).toContain("side");
    expect(cajon.className).toContain("drawer");
    expect(cajon.className).toContain("compacta");
  });
});

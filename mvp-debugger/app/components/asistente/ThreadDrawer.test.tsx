// Lo que protege: elegir un hilo y borrarlo con confirmación. Borrar una
// conversación no se deshace, así que un clic suelto no puede hacerlo.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThreadDrawer, type ThreadDrawerProps } from "@/app/components/asistente/ThreadDrawer";
import type { Thread } from "@/app/lib/asistente/threads";

function thread(id: string, title: string, messages: number): Thread {
  return {
    id,
    title,
    context: "c",
    updatedAt: Date.UTC(2026, 9, 6, 18, 21),
    messages: Array.from({ length: messages }, () => ({ rol: "user" as const, texto: title })),
  };
}

const THREADS = [thread("a", "Irradiancia de la última semana", 8), thread("b", "PR de julio por arreglo", 2)];

function renderDrawer(overrides: Partial<ThreadDrawerProps> = {}) {
  const props: ThreadDrawerProps = {
    id: "hilos",
    open: true,
    threads: THREADS,
    activeId: "a",
    busy: false,
    onClose: vi.fn(),
    onOpenThread: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<ThreadDrawer {...props} />);
  return { props, dialog: screen.getByRole("dialog", { name: "Conversaciones" }) };
}

describe("ThreadDrawer", () => {
  it("lista cada hilo con sus mensajes y marca el activo", () => {
    const { dialog } = renderDrawer();
    const active = within(dialog).getByRole("button", { name: /^Irradiancia de la última semana/ });
    expect(active).toHaveAttribute("aria-current", "true");
    expect(active).toHaveTextContent("8 mensajes");
    expect(within(dialog).getByRole("button", { name: /^PR de julio/ })).not.toHaveAttribute("aria-current");
  });

  it("elegir un hilo lo abre y cierra el cajón", () => {
    const { props, dialog } = renderDrawer();
    fireEvent.click(within(dialog).getByRole("button", { name: /^PR de julio/ }));
    expect(props.onOpenThread).toHaveBeenCalledWith("b");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Borrar pide confirmación en el renglón; Cancelar no borra", () => {
    // Given el cajón con dos hilos
    const { props, dialog } = renderDrawer();
    // When se pide borrar uno y se cancela
    fireEvent.click(within(dialog).getByRole("button", { name: "Borrar «PR de julio por arreglo»" }));
    const confirmation = within(dialog).getByRole("group", { name: "Confirmar el borrado de «PR de julio por arreglo»" });
    expect(within(confirmation).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancelar" }));
    // Then no se borró nada y el renglón vuelve
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: /^PR de julio/ })).toBeInTheDocument();
  });

  it("confirmar el borrado borra ese hilo y no otro", () => {
    const { props, dialog } = renderDrawer();
    fireEvent.click(within(dialog).getByRole("button", { name: "Borrar «PR de julio por arreglo»" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
    expect(props.onDelete).toHaveBeenCalledWith("b");
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("con una respuesta en curso no deja cambiar de hilo ni borrar", () => {
    const { dialog } = renderDrawer({ busy: true });
    expect(within(dialog).getByRole("button", { name: /^PR de julio/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Borrar «PR de julio por arreglo»" })).toBeDisabled();
    expect(within(dialog).getByText(/Esperá a que termine la respuesta/)).toBeInTheDocument();
  });

  it("Escape cierra el cajón", () => {
    const { props, dialog } = renderDrawer();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute("open");
  });
});

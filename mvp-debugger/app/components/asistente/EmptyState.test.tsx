// Lo que protege: que el estado vacío ofrezca las cuatro intenciones con un
// ejemplo que se manda tal cual, y que los hilos recientes se puedan retomar.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/app/components/asistente/EmptyState";
import { EXAMPLE_INTENTS } from "@/app/lib/asistente/intents";
import type { Thread } from "@/app/lib/asistente/threads";

function thread(id: string, title: string): Thread {
  return { id, title, context: "c", updatedAt: 0, messages: [{ rol: "user", texto: title }] };
}

const RECENT = ["a", "b", "c", "d"].map((id) => thread(id, `Hilo ${id}`));

function renderEmpty(recentThreads: readonly Thread[], disabled = false) {
  const onAsk = vi.fn();
  const onOpenThread = vi.fn();
  render(<EmptyState onAsk={onAsk} recentThreads={recentThreads} onOpenThread={onOpenThread} disabled={disabled} />);
  return { onAsk, onOpenThread };
}

describe("EmptyState", () => {
  it("ofrece las cuatro intenciones, cada una con su alcance, y el ejemplo se manda tal cual", () => {
    // Given el estado vacío sin hilos
    const { onAsk } = renderEmpty([]);
    // Then están las cuatro, con su línea de alcance
    EXAMPLE_INTENTS.forEach((intent) => {
      expect(screen.getByText(intent.title)).toBeInTheDocument();
      expect(screen.getByText(intent.scope)).toBeInTheDocument();
    });
    // When se pulsa un ejemplo
    const diagnose = EXAMPLE_INTENTS[EXAMPLE_INTENTS.length - 1];
    fireEvent.click(screen.getByRole("button", { name: diagnose.example }));
    // Then se pregunta exactamente eso
    expect(onAsk).toHaveBeenCalledWith(diagnose.example);
    expect(screen.queryByText("Hilos recientes:")).toBeNull();
  });

  it("muestra hasta tres hilos recientes, y uno se retoma con un clic", () => {
    const { onOpenThread } = renderEmpty(RECENT);
    expect(screen.getByText("Hilos recientes:")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hilo d" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hilo b" }));
    expect(onOpenThread).toHaveBeenCalledWith("b");
  });

  it("con una respuesta en curso los ejemplos y los hilos quedan quietos", () => {
    renderEmpty(RECENT, true);
    expect(screen.getByRole("button", { name: EXAMPLE_INTENTS[0].example })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hilo a" })).toBeDisabled();
  });
});

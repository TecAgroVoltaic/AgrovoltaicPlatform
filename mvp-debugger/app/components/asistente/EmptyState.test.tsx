// Lo que protege: que el estado vacío ofrezca las cuatro intenciones con un
// ejemplo que se manda tal cual, y que los hilos recientes se puedan retomar.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/app/components/asistente/EmptyState";
import { buildExamples } from "@/app/lib/asistente/examples";
import type { Thread } from "@/app/lib/asistente/threads";

// Las preguntas y la cobertura se prueban en `examples.test.ts`; acá solo importa
// que la vista muestre lo que el hook le da y lo mande tal cual.
const EXAMPLES = buildExamples({ coverage: null, latestOutageDate: "2026-08-26" });
vi.mock("@/app/lib/asistente/useExamples", () => ({
  useExamples: () => ({ examples: EXAMPLES, bounds: { from: "2024-11-10", toExclusive: "2026-09-01" } }),
}));

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
    // Then están las cuatro, con su línea de alcance, y la cobertura real
    EXAMPLES.forEach((example) => {
      expect(screen.getByText(example.title)).toBeInTheDocument();
      expect(screen.getByText(example.scope)).toBeInTheDocument();
    });
    expect(screen.getByText(/del 10 nov 2024 al 31 ago 2026/)).toBeInTheDocument();
    // When se pulsa un ejemplo
    const diagnose = EXAMPLES[EXAMPLES.length - 1];
    fireEvent.click(screen.getByRole("button", { name: diagnose.question }));
    // Then se pregunta exactamente eso
    expect(onAsk).toHaveBeenCalledWith(diagnose.question);
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
    expect(screen.getByRole("button", { name: EXAMPLES[0].question })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hilo a" })).toBeDisabled();
  });
});

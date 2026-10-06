// Lo que protege: el teclado del compositor (Enter envía, Mayús+Enter no), que
// los chips dejen una plantilla lista para editar, y que con una respuesta en
// curso el botón corte en vez de enviar.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Composer } from "@/app/components/asistente/Composer";
import { COMPOSER_INTENTS, TEMPLATE_PLACEHOLDER } from "@/app/lib/asistente/intents";

const FIELD = "Pregunta para el asistente";

function renderComposer(busy = false) {
  const onSend = vi.fn();
  const onCancel = vi.fn();
  render(<Composer busy={busy} onSend={onSend} onCancel={onCancel} showIntents />);
  return { onSend, onCancel, field: screen.getByRole("textbox", { name: FIELD }) };
}

describe("Composer", () => {
  it("Enter envía la pregunta y vacía la caja", () => {
    const { onSend, field } = renderComposer();
    fireEvent.change(field, { target: { value: "¿Cómo estuvo agosto?" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("¿Cómo estuvo agosto?");
    expect(field).toHaveValue("");
  });

  it("Mayús+Enter no envía: es un salto de línea", () => {
    const { onSend, field } = renderComposer();
    fireEvent.change(field, { target: { value: "primera línea" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue("primera línea");
  });

  it("una caja vacía o de puros espacios no se envía", () => {
    const { onSend, field } = renderComposer();
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("un chip de intención rellena su plantilla y deja seleccionado lo que hay que completar", () => {
    // Given la caja vacía
    const { onSend, field } = renderComposer();
    const diagnose = COMPOSER_INTENTS.find((intent) => intent.id === "diagnose");
    if (!diagnose) throw new Error("falta la intención de diagnóstico");
    // When se pulsa «Diagnosticar un día»
    fireEvent.click(screen.getByRole("button", { name: diagnose.label }));
    // Then la plantilla queda escrita, sin enviarse, con la fecha a completar seleccionada
    expect(field).toHaveValue(diagnose.template);
    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveFocus();
    const input = field as HTMLTextAreaElement;
    expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe(TEMPLATE_PLACEHOLDER);
  });

  it("con una respuesta en curso, el botón de enviar pasa a Detener y Enter no envía", () => {
    const { onSend, onCancel, field } = renderComposer(true);
    fireEvent.change(field, { target: { value: "otra pregunta" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Detener la respuesta" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

"use client";
// Un <dialog> modal manejado desde React: lo comparten el cajón de hilos y el
// gráfico ampliado del Asistente.
//
// Se usa el <dialog> nativo con `showModal()` y no un div con rol de diálogo
// porque el navegador ya resuelve lo difícil: el resto de la página queda inerte
// (el foco no puede salir), Escape cierra, y el lector de pantalla lo anuncia
// como modal. Lo que se agrega acá es devolver el foco a quien lo abrió y cerrar
// al pulsar el velo, que el nativo no hace.
import { useEffect, useRef, type RefObject } from "react";

/**
 * @param open   si el diálogo tiene que estar abierto (el estado vive afuera).
 * @param onClose se llama cuando el diálogo se cierra por su cuenta (Escape, velo,
 *                un `form method="dialog"`), para que el estado de afuera lo siga.
 * @returns la ref que va en el <dialog>.
 */
export function useModalDialog(open: boolean, onClose: () => void): RefObject<HTMLDialogElement> {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
      onCloseRef.current();
    };
    // El clic en el velo llega con el propio <dialog> como destino: el contenido
    // va en un hijo que lo cubre entero, así que un clic adentro nunca lo es.
    const handleBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dialog.close();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdrop);
    dialog.addEventListener("keydown", handleKey);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdrop);
      dialog.removeEventListener("keydown", handleKey);
    };
  }, []);

  return dialogRef;
}

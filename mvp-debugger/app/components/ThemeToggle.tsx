"use client";
// Interruptor de tema. Escribe `data-theme` en <html>, que es de donde el CSS y
// los gráficos leen la paleta: una sola señal para toda la aplicación.
//
// No se persiste, igual que en la consola de agentes: el valor de arranque es la
// preferencia del sistema, y cambiarlo dura lo que dure la pestaña.
import { useEffect, useState } from "react";

const DARK = "dark";
const LIGHT = "light";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function ThemeToggle() {
  const [theme, setTheme] = useState("");

  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  function toggle() {
    const current = theme || (window.matchMedia(DARK_QUERY).matches ? DARK : LIGHT);
    setTheme(current === DARK ? LIGHT : DARK);
  }

  return (
    <button className="tgl" type="button" onClick={toggle} data-tip="Cambiar tema" aria-label="Cambiar tema">
      ◐
    </button>
  );
}

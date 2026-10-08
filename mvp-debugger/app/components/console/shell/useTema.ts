"use client";
import { useEffect, useState } from "react";

/** El tema elegido ("" = el del sistema), aplicado al documento. */
export function useTema() {
  const [theme, setTheme] = useState("");

  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  function toggleTheme() {
    const eff = theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(eff === "dark" ? "light" : "dark");
  }

  return { theme, toggleTheme };
}

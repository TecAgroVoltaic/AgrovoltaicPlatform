"use client";
// La hora actual, renovada cada `intervalMs`: lo justo para que un «hace 8 s» o
// un «hace 2 h» no se queden congelados mientras la pantalla sigue abierta.
import { useEffect, useState } from "react";

export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

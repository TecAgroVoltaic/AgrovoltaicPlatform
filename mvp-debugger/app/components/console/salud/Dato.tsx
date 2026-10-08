import type { ReactNode } from "react";

/** Un dato con su rótulo, en la rejilla de identidad de las bases. */
export function Dato({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="sal-dato">
      <span className="lbl">{k}</span>
      <span className={mono ? "mono" : ""}>{v}</span>
    </div>
  );
}

// La marca de la aplicación. Extraída para que la barra lateral del sistema de
// análisis y la de la consola de agentes no dibujen dos soles distintos.
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="mark" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="20" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
      <g stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M20 4v4M20 32v4M4 20h4M32 20h4M9 9l3 3M28 28l3 3M31 9l-3 3M12 28l-3 3" />
      </g>
    </svg>
  );
}

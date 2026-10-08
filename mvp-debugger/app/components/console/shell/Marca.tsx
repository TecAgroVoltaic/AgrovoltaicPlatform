import { IconoPanel } from "@/app/components/Iconos";

/** La marca de la consola y, fuera del cajón, el botón que pliega la barra. */
export function Marca({ ancha, enCajon, onPlegar }: {
  ancha: boolean; enCajon: boolean; onPlegar: () => void;
}) {
  return (
    <div className="brand">
      <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
        <g stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round">
          <path d="M20 4v4M20 32v4M4 20h4M32 20h4M9 9l3 3M28 28l3 3M31 9l-3 3M12 28l-3 3" />
        </g>
      </svg>
      <div className="solo-ancha"><b>AgroVoltaic</b><div className="sub muted mono">consola de evaluación</div></div>
      {/* Dentro del cajón NO se dibuja: plegar ahí no ahorraría nada y solo
          taparía las etiquetas del menú que se acaba de abrir para leer. */}
      {!enCajon && (
        <button
          className="plegar"
          onClick={onPlegar}
          data-tip={ancha ? "Plegar la barra" : "Desplegar la barra"}
          aria-label={ancha ? "Plegar la barra lateral" : "Desplegar la barra lateral"}
          aria-expanded={ancha}
        >
          <IconoPanel size={15} />
        </button>
      )}
    </div>
  );
}

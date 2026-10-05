// Cabecera de una sección de análisis y, mientras no existan sus vistas, el
// listado honesto de lo que va a vivir ahí.
//
// El aviso está a propósito: una pantalla vacía sin explicación se lee como una
// aplicación rota, y este producto ya tiene demasiadas pantallas legítimamente
// vacías como para añadir ambigüedad.
import { findSection } from "@/app/components/analitica/sections";

export type SectionIntroProps = {
  readonly path: string;
  /** Qué se va a construir acá, en una línea por pieza. */
  readonly planned: readonly string[];
  /** Contexto del período, cuando la página lo pudo leer del rango. */
  readonly scope?: string;
};

export function SectionIntro({ path, planned, scope }: SectionIntroProps) {
  const section = findSection(path);
  return (
    <div className="vista">
      <header className="phead">
        <h1>{section?.label ?? "Análisis"}</h1>
        <p>{section?.description}</p>
      </header>
      <div className="pendiente">
        <h2>Sección en construcción</h2>
        <p>
          Las fundaciones (rango de fechas, capa de datos y gráficos) ya están.
          Falta conectar las vistas con los endpoints de análisis.
          {scope ? ` ${scope}` : ""}
        </p>
        <ul>
          {planned.map((piece) => (
            <li key={piece}>{piece}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

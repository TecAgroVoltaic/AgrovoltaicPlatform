// Navegación entre páginas de hallazgos. Aritmética de paginación solamente: el
// rango mostrado y el desplazamiento anterior salen de `offset` y `limit`, que
// el servicio publica. Ningún conteo se recalcula acá.
//
// El orden del servicio se enseña porque es lo que hace fiable pasar de página:
// con un orden ambiguo, avanzar repite un hallazgo y se salta otro en silencio.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { formatCount } from "@/app/components/analitica/calidad/format";
import type { FindingsPage } from "@/app/lib/analitica/contracts/calidad";

const FIRST_OFFSET = 0;

export type FindingsPagerProps = {
  readonly page: FindingsPage;
  readonly onGoTo: (offset: number) => void;
};

export function FindingsPager({ page, onGoTo }: FindingsPagerProps) {
  const { offset, limit, nextOffset } = page.page;
  const first = offset + 1;
  const last = offset + page.returned;
  const previousOffset = Math.max(FIRST_OFFSET, offset - limit);

  return (
    // `.loadmore` del cascarón no envuelve: a 360 px «Siguientes» quedaba
    // fuera del borde recortado y no había forma de pasar de página.
    <div className={`loadmore ${styles.pager}`}>
      <button
        className="btn-sm"
        type="button"
        disabled={offset === FIRST_OFFSET}
        onClick={() => onGoTo(previousOffset)}
      >
        ← Anteriores
      </button>
      <p className="muted small" role="status">
        {formatCount(first)} a {formatCount(last)} de {formatCount(page.total)} hallazgos, los más
        graves primero.
      </p>
      <button
        className="btn-sm"
        type="button"
        disabled={nextOffset === null}
        onClick={() => onGoTo(nextOffset ?? offset)}
      >
        Siguientes →
      </button>
      <span className="mono small muted">orden: {page.order}</span>
    </div>
  );
}

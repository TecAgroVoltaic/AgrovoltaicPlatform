/**
 * Los criterios, en la documentación. Las tablas NO están transcritas en la doc:
 * se leen del agente. Una tabla de umbrales escrita a mano envejece sin que nadie
 * se entere, y entonces el documento y el agente discrepan sobre el número que
 * decide si un dato sirve.
 */
import { check } from "./registro.mjs";
import { cargar, fuente, renderizar } from "./entorno.mjs";

const PREFIJO_DE_QUE_DECIDE = 40;

export function verificarDocsCriterios() {
  const { TablasCriterios } = cargar("app/docs/content/agentes.js");
  const { RESPALDO_HISTORICO: m } = cargar("app/components/console/arquitectura/respaldoHistorico.js");
  const doc = renderizar(TablasCriterios, { mapa: m });

  for (const u of m.umbrales) {
    check(`la doc publica el umbral ${u.clave}`, doc.includes(u.clave));
    check(`  …con qué decide`, doc.includes(u.que_decide.slice(0, PREFIJO_DE_QUE_DECIDE)));
  }
  check("y dice que son política, no física", /política/.test(doc),
    "quien los lee suele estar evaluando si el criterio le sirve");
  check("la doc publica los 12 tipos de hallazgo",
    m.hallazgos.tipos.every((t) => doc.includes(t.tipo)));
  check("y las garantías", m.garantias.every((g) => doc.includes(g.que)));

  // La prueba de que no están transcritas: ningún umbral aparece escrito en el
  // fuente de la doc. Si alguien copia uno a mano, esto lo caza.
  const fuenteDoc = fuente("app/docs/content/agentes.tsx", "app/docs/content/agentes");
  const transcritos = m.umbrales.map((u) => u.clave).filter((k) => fuenteDoc.includes(k));
  check("los umbrales NO están escritos a mano en la doc",
    // COBERTURA_MINIMA es la excepción declarada: la prosa la NOMBRA para buscar
    // su valor y redactar el ejemplo. Los demás no pueden aparecer.
    transcritos.length === 0 || (transcritos.length === 1 && transcritos[0] === "COBERTURA_MINIMA"),
    `transcritos: ${transcritos.join(", ")} — envejecen sin que nadie se entere`);
  check("la sección del Histórico ya no dice «Herramientas (8)»",
    !/Herramientas \(8\)/.test(fuenteDoc), "hay 13");
  check("ni apunta al entrypoint viejo", !/analizador\.api:app/.test(fuenteDoc));
}

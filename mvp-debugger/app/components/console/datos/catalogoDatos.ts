// Catálogo de la vista «Base de datos»: la PROSA y la GEOMETRÍA del recorrido ETL.
//
// Diferencia importante con `arquitectura/catalogo.ts`: aquella vista se dibuja
// con lo que el servicio publica en vivo, así que no puede mentir. Esta NO tiene
// esa red. El servicio del pronóstico solo lee `lecturas_ambientales_sc`; las
// tablas fotovoltaicas (`monitoreo_sc_electrico`, `radiacion_sc_15s`) no pasan
// por él, así que ningún endpoint puede reportar estas cifras.
//
// La consecuencia se asume de frente en vez de disimularse: los números son un
// CORTE FECHADO, la fecha está a la vista en la pantalla (ver `CORRIDA`), y quien
// los lea sabe que está viendo una foto y no un termómetro. Un número sin fecha
// habría envejecido en silencio, que es exactamente lo que esta consola no puede
// permitirse.
//
// Verificados con SELECT contra la base viva el 2026-08-20.
//
// Las piezas viven en `catalogoDatos/`: el recorrido (tipos), los actos, las
// zonas y los tratamientos.

/** Cuándo se corrió el ETL y cuándo se verificaron estas cifras contra la base. */
export const CORRIDA = { ejecutado: "2026-08-10", verificado: "2026-08-20" };

export type { Acto, Muestra } from "./catalogoDatos/recorrido";
export { ACTOS } from "./catalogoDatos/actos";
export { ZONAS } from "./catalogoDatos/zonas";
export { TRATAMIENTOS, type Tratamiento } from "./catalogoDatos/tratamientos";

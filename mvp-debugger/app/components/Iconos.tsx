"use client";
// Iconos de la consola. SVG inline, trazo de 1.7, 16px. NO emojis: la paleta de
// la consola es sobria y un emoji rompe la tipografía y el color a la vez.
//
// Existen para distinguir de un vistazo QUIÉN hizo cada cosa: el algoritmo
// determinista, el modelo que orquesta, la web. Es la separación que este
// debugger tiene que demostrar, así que merece señal visual y no solo texto.
//
// Barril: cada familia vive en `Iconos/`, todas sobre la misma base.
export { IconoAlgoritmo, IconoModelo, IconoTexto, IconoWeb } from "./Iconos/autoria";
export { IconoCheck, IconoAlerta, IconoError, IconoCampana } from "./Iconos/estado";
export {
  IconoReconciliar, IconoPrediccion, IconoGrafo, IconoDatos, IconoRendimiento,
  IconoCosto, IconoSalud, IconoDocs, IconoCalidad,
} from "./Iconos/navegacion";
export { IconoTablero, IconoSerie, IconoEstadistica, IconoDescarga, IconoAsistente } from "./Iconos/analisis";
export { IconoPanel, IconoMinimizar } from "./Iconos/acciones";

// Lo que se está mirando en /alertas vive en la URL, junto al rango: filtros,
// página y la alerta abierta. Así una lista filtrada o una ficha se comparten
// pegando el enlace, y «atrás» cierra la ficha como se espera.
//
// Puro (sin React ni Next): leer, escribir y cambiar la consulta se prueba sin
// montar nada. Barril: el modelo vive en `query/model.ts` y la traducción a URL
// y API en `query/url.ts`.
export {
  ALERTS_PARAM,
  ALERTS_PAGE_SIZE,
  DEFAULT_ALERT_FILTERS,
  reduceAlertsQuery,
  isDefaultFilters,
  statusesOf,
  type StatusFilter,
  type AlertFilters,
  type AlertsQuery,
  type AlertsQueryChange,
} from "./query/model";
export { parseAlertsQuery, alertsQueryToSearch, alertsListParams } from "./query/url";

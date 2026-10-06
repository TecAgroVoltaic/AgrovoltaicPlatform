// Lo que protegen estas pruebas: que los filtros sobrevivan al ida y vuelta por
// la URL sin pisar el rango, y que cambiar un filtro vuelva a la primera página.
import { describe, expect, it } from "vitest";

import {
  alertsListParams,
  alertsQueryToSearch,
  DEFAULT_ALERT_FILTERS,
  parseAlertsQuery,
  reduceAlertsQuery,
  type AlertsQuery,
} from "@/app/lib/alertas/query";

const DEFAULT_QUERY: AlertsQuery = { filters: DEFAULT_ALERT_FILTERS, offset: 0, selectedId: null };

function parse(search: string): AlertsQuery {
  return parseAlertsQuery(new URLSearchParams(search));
}

describe("leer la consulta de la URL", () => {
  it("sin parámetros propios muestra las abiertas desde la primera página", () => {
    // Given una URL con solo el rango
    // When se lee
    // Then es la consulta por defecto
    expect(parse("desde=2026-08-01&hasta=2026-09-01")).toEqual(DEFAULT_QUERY);
  });

  it("lee estado, gravedad, tipo, búsqueda, página y ficha abierta", () => {
    // Given una URL compartida con todo
    const search =
      "estado=resuelta&severidad=grave&tipo=irradiancia_imposible&q=inversor&offset=40&alerta=7";

    // When se lee
    const query = parse(search);

    // Then cada parámetro llega traducido
    expect(query).toEqual({
      filters: {
        status: "resolved",
        severity: "critical",
        type: "irradiancia_imposible",
        search: "inversor",
      },
      offset: 40,
      selectedId: 7,
    });
  });

  it.each([
    ["estado desconocido", "estado=archivada", { filters: DEFAULT_ALERT_FILTERS }],
    ["gravedad desconocida", "severidad=info", { filters: DEFAULT_ALERT_FILTERS }],
    ["desplazamiento negativo", "offset=-20", { offset: 0 }],
    ["desplazamiento no numérico", "offset=dos", { offset: 0 }],
    ["ficha con id cero", "alerta=0", { selectedId: null }],
    ["ficha con id no entero", "alerta=7.5", { selectedId: null }],
  ])("un %s vuelve al defecto", (_case, search, expected) => {
    // Given un parámetro malformado / When se lee / Then cae al valor por defecto
    expect(parse(search)).toMatchObject(expected);
  });

  it("todas las alertas se escriben con la lista completa de estados", () => {
    // Given el corte «todas» / When se escribe y se vuelve a leer
    const query = reduceAlertsQuery(DEFAULT_QUERY, {
      kind: "filters",
      filters: { ...DEFAULT_ALERT_FILTERS, status: "all" },
    });
    const search = alertsQueryToSearch(query);

    // Then el ida y vuelta conserva el corte
    expect(search).toBe("?estado=nueva%2Creconocida%2Cen_seguimiento%2Cresuelta%2Cdescartada");
    expect(parse(search.slice(1)).filters.status).toBe("all");
  });
});

describe("escribir la consulta en la URL", () => {
  it("conserva el rango y omite lo que vale el defecto", () => {
    // Given una URL con rango y una página vieja
    const current = new URLSearchParams("desde=2026-08-01&hasta=2026-09-01&offset=40");

    // When se escribe la consulta por defecto
    const search = alertsQueryToSearch(DEFAULT_QUERY, current);

    // Then el rango queda y el desplazamiento viejo desaparece
    expect(search).toBe("?desde=2026-08-01&hasta=2026-09-01");
  });

  it("no escribe una búsqueda hecha solo de espacios", () => {
    // Given una búsqueda en blanco
    const query = { ...DEFAULT_QUERY, filters: { ...DEFAULT_ALERT_FILTERS, search: "   " } };

    // When se escribe / Then no aparece `q`
    expect(alertsQueryToSearch(query)).toBe("");
  });
});

describe("cambiar la consulta", () => {
  it("cambiar un filtro vuelve a la primera página y conserva la ficha abierta", () => {
    // Given la página tres con una ficha abierta
    const query: AlertsQuery = { ...DEFAULT_QUERY, offset: 40, selectedId: 7 };

    // When se filtra por gravedad
    const next = reduceAlertsQuery(query, {
      kind: "filters",
      filters: { ...DEFAULT_ALERT_FILTERS, severity: "critical" },
    });

    // Then vuelve al principio sin cerrar la ficha
    expect(next.offset).toBe(0);
    expect(next.selectedId).toBe(7);
  });

  it("pasar de página no toca los filtros", () => {
    // Given un filtro por tipo
    const query: AlertsQuery = {
      ...DEFAULT_QUERY,
      filters: { ...DEFAULT_ALERT_FILTERS, type: "irradiancia_imposible" },
    };

    // When se avanza
    const next = reduceAlertsQuery(query, { kind: "page", offset: 20 });

    // Then el filtro sigue
    expect(next).toEqual({ ...query, offset: 20 });
  });
});

describe("parámetros de GET /alertas", () => {
  it("por defecto pide las abiertas, con página fija de 20", () => {
    // Given la consulta por defecto / When se arman los parámetros
    // Then piden los tres estados abiertos
    expect(alertsListParams(DEFAULT_QUERY)).toEqual({
      estado: "nueva,reconocida,en_seguimiento",
      limite: "20",
      offset: "0",
    });
  });
});

import type { Resumen } from "./tipos";

/** Traduce la respuesta de `/calidad/resumen` a lo que pinta la vista.
 *
 * Existe porque el servicio habla en los terminos del AGENTE (un veredicto para
 * narrar, los cinco problemas mas frecuentes) y la vista necesita otra cosa (un
 * conteo para un KPI, el desglose completo con fuente y fechas). Traducir aca, en
 * un solo lugar y en el borde, es preferible a que cada trozo de JSX sepa la forma
 * exacta del JSON: cuando el servicio cambie, se cambia esta funcion y nada mas.
 */
export function normalizar(api: any): Resumen {
  const v = api?.calidad?.veredicto ?? {};
  const c = api?.cielo?.resumen ?? {};
  return {
    periodo: api?.calidad?.periodo ?? { desde: "", hasta: "" },
    cobertura: {
      dias_con_datos: v.dias_con_datos ?? 0,
      dias_calendario: v.dias_en_rango ?? 0,
    },
    cielo: {
      dias: c.dias ?? 0,
      kt_medio: c.kt_medio ?? null,
      vi_medio: c.variabilidad_media ?? null,
      despejados: c.despejados ?? 0,
      parciales: c.parciales ?? 0,
      cubiertos: c.cubiertos ?? 0,
      variables: c.variables ?? 0,
      pct_del_techo: c.pct_del_techo ?? null,
    },
    tipos: Array.isArray(api?.tipos) ? api.tipos : [],
  };
}

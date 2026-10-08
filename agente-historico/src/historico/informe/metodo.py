"""Los textos fijos de la hoja Método: parametros del calculo y trazabilidad."""
from __future__ import annotations

from historico.analitica import rendimiento
from historico.informe.tabla import numero_es


def parametros() -> list[tuple[str, str]]:
    kwp = numero_es(rendimiento.KWP_POR_ARREGLO, 2)
    return [
        ("Sitio", "San Carlos, Costa Rica. Hora local UTC-6, sin horario de verano."),
        ("Arreglos", f"PV1 inclinado (20°/150°) y PV2 vertical (90°/50°), bifaciales, "
                     f"{kwp} kWp cada uno."),
        ("Performance Ratio", f"(energía del día / {kwp} kWp) / (irradiación del día / "
                              "1 kW/m²). Por día y por mes, no cada 5 minutos."),
        ("PR de un mes o del periodo", "Energía total sobre irradiación total de los "
                                       "días que tienen las dos (IEC 61724). No es el "
                                       "promedio de los PR diarios."),
        ("Día apto para PR",
         f"Radiación y eléctrico cubren al menos el "
         f"{rendimiento.COBERTURA_MINIMA:.0%} del día solar y sus horas difieren en "
         f"menos de {numero_es(rendimiento.DESFASE_MAXIMO_H, 1)} h."),
        ("Irradiación", "Irradiancia por el intervalo real entre lecturas, con techo de "
                        f"{rendimiento.TECHO_DT_SEG} s. La cadencia no es fija."),
        ("Energía AC del día", "Máximo diario del contador energia_hoy_wh."),
        ("Energía DC por arreglo", "Máximo diario de energia_pv1_wh y energia_pv2_wh; "
                                   "la integral de potencia va al lado como respaldo."),
        ("Planta parada", "Voltaje, frecuencia y potencia AC en cero entre las 7 y las "
                          "17 h. Es disponibilidad del equipo, no calidad del dato."),
        ("Celdas vacías", "Sin dato. Nunca equivalen a cero."),
    ]


def traza(meta: dict, lectura: dict) -> list[tuple[str, str]]:
    costo = (lectura.get("costo") or {}).get("usd_total")
    uso = lectura.get("usage") or {}
    return [
        ("Generado", meta["generado"]),
        ("Periodo", f"{meta['desde']} a {meta['hasta']}"),
        ("Diario", "analitica.rendimiento.consultar + analitica.energia.por_dia + "
                   "calidad.contexto.dias"),
        ("Mensual", "analitica.rendimiento.componer sobre los días aptos"),
        ("Disponibilidad", "subconjunto de Diario"),
        ("Calidad", "calidad.reporte.hallazgos_por_tipo"),
        ("Lectura: modelo", lectura.get("modelo") or "sin modelo"),
        ("Lectura: intentos", str(lectura.get("intentos", 0))),
        ("Lectura: tokens", f"{uso.get('input_tokens', 0)} de entrada, "
                            f"{uso.get('output_tokens', 0)} de salida"),
        ("Lectura: costo", "sin costo" if costo is None else f"US$ {costo:.4f}"),
        ("Lectura: verificación",
         "aprobada: toda cifra del texto sale de la tabla de hechos"
         if lectura["parrafos"] else f"sin lectura: {lectura['motivo']}"),
    ]

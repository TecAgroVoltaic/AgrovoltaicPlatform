"""Arma el informe de un periodo: consulta, compone, redacta y escribe.

Tres pasos que no se mezclan:

  1. `datos.recolectar`   la unica parte que toca la base.
  2. `componer`           PURA: hojas, hechos y advertencias desde las filas.
  3. `redaccion.redactar` el modelo, que solo ve los hechos y puede fallar sin
                          que el libro deje de salir.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from historico import config, errores
from historico.analitica import rendimiento, resumen, ventana as ventana_mod
from historico.analitica.ventana import Ventana
from historico.informe import datos, hechos as hechos_mod, libro, redaccion, secciones
from historico.informe.tabla import Hecho, Hoja, numero_es, si_no

SIN_LECTURA_PEDIDA = "se pidió el informe sin lectura"


@dataclass(frozen=True)
class Informe:
    cuerpo: bytes
    nombre: str
    meta: dict
    hechos: list[Hecho]
    advertencias: list[str]
    lectura: dict


def ventana_inclusiva(desde: str | None, hasta: str | None) -> tuple[Ventana, str, str]:
    """El rango como lo escribe una persona: `hasta` entra. Igual que Descargas."""
    if not desde or not hasta:
        raise errores.ParametroInvalido(
            "el informe necesita `desde` y `hasta` (aaaa-mm-dd), los dos incluidos")
    # Se parsean por la puerta de `ventana` para heredar su error con `codigo`.
    primero = ventana_mod.crear(desde, None).desde
    ultimo = ventana_mod.crear(hasta, None).desde
    if ultimo < primero:
        raise errores.ParametroInvalido(
            f"`hasta` ({ultimo}) no puede ser anterior a `desde` ({primero})")
    v = ventana_mod.crear(primero, ultimo + timedelta(days=1))
    return v, primero.isoformat(), ultimo.isoformat()


def _advertencias(dias: list[dict], total: dict, ultimo_dato: str | None) -> list[str]:
    salida = [
        "La irradiancia está sin calibrar: todo PR de este informe es provisional.",
        "El PR contra el plano propio usa una irradiancia modelada con pvlib; la "
        "ecuación de transposición está pendiente de aval.",
        "Las columnas de energía del inversor terminan en _wh pero están en kWh. "
        "Este informe las entrega en kWh.",
        f"De {total['dias_aptos_pr']} días aptos para PR, {total['dias_pr']} tienen "
        "contador DC por arreglo. El PR del periodo se apoya solo en esos.",
    ]
    imposibles = sum(1 for d in dias if d["motivo"] == secciones.PR_IMPOSIBLE)
    if imposibles:
        salida.append(f"Días con un PR mayor a 1: {imposibles}. Es físicamente "
                      "imposible y apunta a la irradiancia. Están marcados en la hoja "
                      "Diario.")
    salida.append(f"El último dato eléctrico de toda la base es del "
                  f"{(ultimo_dato or 'sin dato')[:10]}: la carga de datos es manual.")
    return salida


def _parametros() -> list[tuple[str, str]]:
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


def _traza(meta: dict, lectura: dict) -> list[tuple[str, str]]:
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


def componer(insumos: dict, etiqueta_desde: str, etiqueta_hasta: str,
             ultimo_dato: str | None) -> dict:
    """Hojas, hechos y advertencias desde los insumos crudos. PURA."""
    dias = secciones.filas_diario(insumos["calendario"], insumos["filas_pr"],
                                  insumos["filas_energia"])
    # Solo las filas de dias del calendario pedido: `rendimiento.consultar` ya
    # acota por la misma ventana, pero el agregado tiene que hablar de los mismos
    # dias que la hoja Diario si alguna vez dejaran de coincidir.
    fechas = {d["fecha"] for d in dias}
    filas_pr = [f for f in insumos["filas_pr"] if str(f["dia"]) in fechas]
    pr = rendimiento.componer(filas_pr, rendimiento.GHI, insumos["motivo_poa"])
    meses = secciones.filas_mensual(dias, pr["por_mes"])
    total = secciones.fila_agregada(libro.TOTAL, dias, pr["total"])
    hojas: list[Hoja] = [
        secciones.diario(dias),
        secciones.mensual([*meses, total]),
        secciones.disponibilidad(dias),
        secciones.calidad(insumos["tipos"]),
    ]
    return {
        "hojas": hojas,
        "hechos": hechos_mod.armar(etiqueta_desde, etiqueta_hasta, dias, meses, total,
                                   insumos["tipos"]),
        "advertencias": _advertencias(dias, total, ultimo_dato),
        "dias_con_datos": total["dias_con_datos"],
        "dias_parada": sum(1 for d in dias if d["planta_parada"] == si_no(True)),
    }


def _ahora() -> str:
    return datetime.now(ZoneInfo(config.TZ)).strftime("%Y-%m-%d %H:%M (hora de Costa Rica)")


def preparar(desde: str | None, hasta: str | None) -> tuple[dict, dict]:
    """(meta, composicion) sin redactar ni escribir. Lo usa tambien la tool."""
    v, etiqueta_desde, etiqueta_hasta = ventana_inclusiva(desde, hasta)
    insumos = datos.recolectar(v)
    ultimo_dato = resumen.ultimo_global()
    meta = {"desde": etiqueta_desde, "hasta": etiqueta_hasta, "generado": _ahora(),
            "ultimo_dato": ultimo_dato}
    return meta, componer(insumos, etiqueta_desde, etiqueta_hasta, ultimo_dato)


def generar(desde: str | None, hasta: str | None, foco: str | None = None,
            con_lectura: bool = True, client=None) -> Informe:
    """El informe completo del periodo [desde, hasta], los dos dias incluidos."""
    meta, comp = preparar(desde, hasta)
    meta["foco"] = (foco or "").strip() or None
    if con_lectura:
        lectura = redaccion.redactar(comp["hechos"], comp["advertencias"],
                                     meta["foco"], client=client)
    else:
        lectura = {"parrafos": [], "motivo": SIN_LECTURA_PEDIDA, "intentos": 0,
                   "modelo": None, "usage": {}, "costo": {}}
    cuerpo = libro.escribir(meta, lectura, comp["advertencias"], comp["hechos"],
                            comp["hojas"], _parametros(), _traza(meta, lectura))
    nombre = f"informe-agrovoltaic-sc_{meta['desde']}_{meta['hasta']}.xlsx"
    return Informe(cuerpo, nombre, meta, comp["hechos"], comp["advertencias"], lectura)

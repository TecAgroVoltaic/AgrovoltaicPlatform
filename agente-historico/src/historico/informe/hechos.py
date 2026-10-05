"""Los hechos del periodo: cada numero que la lectura puede citar, con su origen.

PURO. Es la frontera entre el calculo y la redaccion: el modelo no recibe las
hojas, recibe esta lista. Lo que no esta aca no se puede afirmar, y por eso la
lista es deliberadamente corta y no un volcado de las tablas.
"""
from __future__ import annotations

from historico.informe import secciones
from historico.informe.tabla import Hecho, si_no

# Cuantos tipos de hallazgo se ofrecen a la lectura. Para narrar alcanzan los mas
# extendidos; el desglose entero esta en la hoja Calidad.
TIPOS_DESTACADOS = 5

_DIARIO, _MENSUAL, _CALIDAD = "Diario", "Mensual", "Calidad"
_SEVERIDAD = {"grave": 0, "aviso": 1}


class _Lista:
    """Numera los hechos en el orden en que se agregan (H1, H2, ...)."""

    def __init__(self) -> None:
        self.hechos: list[Hecho] = []

    def agregar(self, indicador: str, valor, unidad: str = "", origen: str = "",
                decimales: int = 0) -> None:
        self.hechos.append(Hecho(f"H{len(self.hechos) + 1}", indicador, valor,
                                 unidad, origen, decimales))


def _ultimo_con_datos(dias: list[dict]) -> str | None:
    con_datos = [d["fecha"] for d in dias if d["filas_electrico"]]
    return max(con_datos) if con_datos else None


def _generales(lista: _Lista, etiqueta_desde: str, etiqueta_hasta: str,
               dias: list[dict], total: dict) -> None:
    lista.agregar("Inicio del periodo", etiqueta_desde)
    lista.agregar("Fin del periodo", etiqueta_hasta)
    lista.agregar("Días del periodo", total["dias_calendario"], "días",
                  f"{_DIARIO}: renglones")
    lista.agregar("Días con datos eléctricos", total["dias_con_datos"], "días",
                  f"{_DIARIO}: filas_electrico mayor a cero")
    lista.agregar("Días sin ningún dato eléctrico",
                  total["dias_calendario"] - total["dias_con_datos"], "días",
                  f"{_DIARIO}: filas_electrico en cero")
    lista.agregar("Último día con datos eléctricos", _ultimo_con_datos(dias),
                  origen=f"{_DIARIO}: fecha")
    lista.agregar("Días aptos para PR", total["dias_aptos_pr"], "días",
                  f"{_DIARIO}: apto_pr")


def _energia(lista: _Lista, total: dict) -> None:
    for clave, nombre in (("energia_ac_kwh", "Energía AC registrada"),
                          ("energia_dc_inclinado_kwh", "Energía DC del arreglo inclinado"),
                          ("energia_dc_vertical_kwh", "Energía DC del arreglo vertical")):
        lista.agregar(nombre, total[clave], "kWh", f"{_MENSUAL}: fila Total", 2)


def _rendimiento(lista: _Lista, total: dict) -> None:
    origen = f"{_MENSUAL}: fila Total"
    lista.agregar("PR del inclinado contra irradiancia horizontal",
                  total["pr_inclinado_ghi"], "", origen, 3)
    lista.agregar("PR del vertical contra irradiancia horizontal",
                  total["pr_vertical_ghi"], "", origen, 3)
    lista.agregar("Días que sostienen el PR del periodo", total["dias_pr"], "días",
                  origen)
    lista.agregar("Ventaja del inclinado sobre el vertical (horizontal)",
                  total["ventaja_inclinado_pct"], "%", origen, 1)
    lista.agregar("PR del inclinado contra su plano (provisional)",
                  total["pr_inclinado_poa"], "", origen, 3)
    lista.agregar("PR del vertical contra su plano (provisional)",
                  total["pr_vertical_poa"], "", origen, 3)
    lista.agregar("Ventaja del inclinado sobre el vertical (plano propio, provisional)",
                  secciones.ventaja(total["pr_inclinado_poa"], total["pr_vertical_poa"]),
                  "%", origen, 1)


def _disponibilidad(lista: _Lista, dias: list[dict], total: dict) -> None:
    con_sol = sum(1 for d in dias if d["parada_bajo_sol"] == si_no(True))
    lista.agregar("Días con la planta parada en horario diurno", total["dias_parada"],
                  "días", "Disponibilidad: renglones")
    lista.agregar("Días con la planta parada y sol", con_sol, "días",
                  "Disponibilidad: parada_bajo_sol")
    lista.agregar("Horas con la planta parada", total["horas_parada"], "h",
                  "Disponibilidad: horas_parada", 1)


def _calidad(lista: _Lista, dias: list[dict], tipos: list[dict]) -> None:
    for veredicto, n in sorted(secciones.conteo(dias, "calidad").items()):
        lista.agregar(f"Días con calidad del dato «{veredicto}»", n, "días",
                      f"{_DIARIO}: calidad")
    for clase, n in sorted(secciones.conteo(dias, "cielo").items()):
        lista.agregar(f"Días con cielo «{clase}»", n, "días", f"{_DIARIO}: cielo")
    # Primero lo grave: por dias a secas ganan los `info`, que estan casi todos los
    # dias y no dicen nada del periodo.
    destacados = sorted(tipos, key=lambda t: (_SEVERIDAD.get(t["severidad"], 9),
                                              -t["dias"]))[:TIPOS_DESTACADOS]
    for t in destacados:
        lista.agregar(
            f"Días con hallazgo «{t['tipo']}» ({t['severidad']}, {t['fuente']})",
            t["dias"], "días", f"{_CALIDAD}: dias")


def _meses(lista: _Lista, meses: list[dict]) -> None:
    for m in meses:
        origen = f"{_MENSUAL}: fila {m['mes']}"
        lista.agregar(f"Energía AC de {m['mes']}", m["energia_ac_kwh"], "kWh", origen, 2)
        lista.agregar(f"PR del inclinado (horizontal) de {m['mes']}",
                      m["pr_inclinado_ghi"], "", origen, 3)
        lista.agregar(f"PR del vertical (horizontal) de {m['mes']}",
                      m["pr_vertical_ghi"], "", origen, 3)
        lista.agregar(f"Días con la planta parada de {m['mes']}", m["dias_parada"],
                      "días", origen)


def armar(etiqueta_desde: str, etiqueta_hasta: str, dias: list[dict],
          meses: list[dict], total: dict, tipos: list[dict]) -> list[Hecho]:
    """La lista completa, en el orden en que se lee el informe."""
    lista = _Lista()
    _generales(lista, etiqueta_desde, etiqueta_hasta, dias, total)
    _energia(lista, total)
    _rendimiento(lista, total)
    _disponibilidad(lista, dias, total)
    _calidad(lista, dias, tipos)
    # Con un solo mes, sus hechos repiten el total: no agregan nada que citar.
    if len(meses) > 1:
        _meses(lista, meses)
    return lista.hechos

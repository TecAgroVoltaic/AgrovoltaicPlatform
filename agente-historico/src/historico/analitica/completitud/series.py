"""La serie de completitud por periodo y los tramos sin datos. Puro, sin DB."""
from __future__ import annotations

from datetime import date, timedelta

from historico.analitica.completitud.constantes import _CAMPO_FILAS
from historico.analitica.completitud.medida import _fecha, _fraccion, cadencia, esperadas
from historico.analitica.ventana import DIA, HORA, MES, SEMANA


def granularidad_efectiva(granularidad: str) -> str:
    """La granularidad con que se agrupa la serie.

    `hora` no puede partir un dia de calendario, que es la unidad minima de
    `ventana_solar`: cae a `dia` en vez de devolver un cubo por dia disfrazado
    de hora.
    """
    return DIA if granularidad == HORA else granularidad


def _cubo(fecha: date, granularidad: str) -> date:
    """El periodo al que pertenece un dia, identificado por su primera fecha."""
    if granularidad == MES:
        return fecha.replace(day=1)
    if granularidad == SEMANA:
        return fecha - timedelta(days=fecha.weekday())
    return fecha


def _punto(inicio: date, dias: list[dict], fuente: str) -> dict:
    """Un punto de la serie: lo real contra lo esperado A SU PROPIA CADENCIA.

    La cadencia es del periodo entero y no de cada dia porque los dias en cero no
    tienen ninguna, y son justamente los que hay que poder esperar.
    """
    seg, origen = cadencia(dias, fuente)
    campo = _CAMPO_FILAS[fuente]
    grabaron = [dia for dia in dias if dia.get(campo)]
    lecturas = sum(dia.get(campo) or 0 for dia in dias)
    objetivo = sum(esperadas(dia.get("horas_sol") or 0.0, seg) for dia in dias)
    objetivo_grabaron = sum(esperadas(dia.get("horas_sol") or 0.0, seg) for dia in grabaron)
    return {
        "periodo": inicio.isoformat(), "dias": len(dias),
        "dias_sin_datos": len(dias) - len(grabaron),
        "lecturas": lecturas,
        "esperadas": objetivo, "completitud": _fraccion(lecturas, objetivo),
        # La segunda razon deja fuera los dias que el logger no corrio, y separa
        # "no se grabo nada" de "se grabo y se perdieron puntos". Sin ella,
        # diciembre 2024 (moda real 2 s, 6 dias de 31 con datos) da 0,003 y se lee
        # como perdida masiva cuando lo que hubo fue un logger apagado.
        "esperadas_dias_con_datos": objetivo_grabaron,
        "completitud_dias_con_datos": _fraccion(lecturas, objetivo_grabaron),
        "cadencia_seg": seg, "cadencia_origen": origen,
    }


def serie(dias: list[dict], granularidad: str, fuente: str) -> list[dict]:
    """Lecturas reales contra esperadas por periodo, para una fuente. Puro, sin DB."""
    cubos: dict[date, list[dict]] = {}
    for dia in dias:
        cubos.setdefault(_cubo(_fecha(dia["fecha"]), granularidad), []).append(dia)
    return [_punto(inicio, grupo, fuente) for inicio, grupo in sorted(cubos.items())]


def tramos_sin_datos(dias: list[dict], fuente: str) -> list[dict]:
    """Los huecos como TRAMOS con fecha de inicio y fin, no como 295 fechas sueltas.

    Un salto en el calendario corta el tramo: dos dias no consecutivos no se pueden
    reportar como un hueco continuo sin afirmar algo que no se midio.
    """
    campo = _CAMPO_FILAS[fuente]
    tramos: list[dict] = []
    abierto: dict | None = None
    previo: date | None = None
    for dia in dias:
        fecha = _fecha(dia["fecha"])
        consecutivo = previo is not None and (fecha - previo).days == 1
        if dia.get(campo):
            abierto = None
        elif abierto is not None and consecutivo:
            abierto["hasta"], abierto["dias"] = fecha.isoformat(), abierto["dias"] + 1
        else:
            abierto = {"desde": fecha.isoformat(), "hasta": fecha.isoformat(), "dias": 1}
            tramos.append(abierto)
        previo = fecha
    return tramos

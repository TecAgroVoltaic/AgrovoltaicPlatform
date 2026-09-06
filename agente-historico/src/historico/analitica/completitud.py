"""Fig. 4: cuantos puntos hay en el servidor por periodo, y cuantos deberia haber.

Tres decisiones que definen el modulo:

1. **La serie sale del CALENDARIO (`ventana_solar`), no de las tablas de datos.**
   Los dias con CERO filas son justamente lo que hay que ver, y una consulta a la
   tabla de datos solo puede mostrar lo que existe: los 295 dias sin dato de los
   569 del calendario simplemente no aparecerian. Mismo criterio que
   `calidad.contexto.dias()`.
2. **Electrico y radiacion van por separado.** Fundirlos esconde que se muestrean
   a escalas distintas, y una serie unica quedaria dominada por la radiacion.
3. **La cadencia de referencia se MIDE de los saltos entre filas consecutivas**, y
   no sale ni de una constante ni de `intervalo_original_seg`. `radiacion_sc_15s`
   es el nombre del objetivo del resampleo y no lo que la tabla contiene: los
   saltos reales de la radiacion van 15, 30, 45, 60, 75, 300, 315 y 330 s, y solo
   octubre 2025 estuvo de verdad a 15 s. Medir todo contra los 15 s nominales daba
   ~4% de completitud en casi todo el historico, que se lee como perdida
   catastrofica de datos que en realidad nunca se tomaron.
   `intervalo_original_seg` tampoco sirve: guarda la cadencia del CSV de ORIGEN,
   asi que en lo electrico dice 2 a 330 s mientras las filas guardadas estan
   remuestreadas a 5 min uniformes (35.101 de 36.468 saltos son exactamente 300 s).
   Queda como trazabilidad del origen, no como referencia. La constante nominal es
   el ultimo recurso y, cuando se usa, el punto sale marcado.

Lo esperado se mide contra las HORAS DE SOL del dia y no contra 24 h: el logger de
San Carlos solo graba de dia (11,5 a 12,7 h segun la fecha).

El SQL vive en `_consultar_dias` y el criterio en las funciones puras de abajo
(`cadencia`, `esperadas`, `serie`, `tramos_sin_datos`, `resumir` y `componer`), que
se prueban sin base de datos.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import db
from historico.analitica import resultado
from historico.analitica.ventana import DIA, HORA, MES, SEMANA, Ventana
from historico.calidad import contexto

ELECTRICO, RADIACION = "electrico", "radiacion"
FUENTES = (ELECTRICO, RADIACION)

# Cadencia OBJETIVO de cada fuente segun el documento. Es el ultimo recurso: solo
# se usa cuando el periodo no tiene ni una fila con `intervalo_original_seg`.
CADENCIA_NOMINAL_SEG = {ELECTRICO: 300, RADIACION: 15}

# De donde salio la cadencia contra la que se midio el periodo.
MEDIDA, NOMINAL = "medida", "nominal"

_CAMPO_FILAS = {ELECTRICO: "filas_electrico", RADIACION: "filas_radiacion"}
_CAMPO_CADENCIA = {ELECTRICO: "cadencia_electrico", RADIACION: "cadencia_radiacion"}
_SEGUNDOS_POR_HORA = 3600

# La completitud cuenta FILAS, no valores de una columna, asi que ninguna columna
# rota la invalida: el bloque de confianza queda como cobertura de dias del periodo.
COLUMNAS: list[str] = []

# La cadencia sale del ESPACIADO REAL entre filas consecutivas y NO de
# `intervalo_original_seg`: esa columna guarda la cadencia del CSV de origen y miente
# sobre lo almacenado (35.101 de 36.468 saltos electricos son exactamente 300 s
# mientras la columna va de 2 a 330 s). `lag` va particionado por dia para que el
# salto nocturno, que no es una cadencia, no entre en la moda.
_SQL_DIAS = """
    WITH ele_salto AS (
        SELECT "timestamp"::date AS f,
               EXTRACT(epoch FROM "timestamp" - lag("timestamp")
                       OVER (PARTITION BY "timestamp"::date ORDER BY "timestamp")) AS salto
          FROM v_sc_electrico_corregido
         WHERE "timestamp" >= %s AND "timestamp" < %s),
         rad_salto AS (
        SELECT "timestamp"::date AS f,
               EXTRACT(epoch FROM "timestamp" - lag("timestamp")
                       OVER (PARTITION BY "timestamp"::date ORDER BY "timestamp")) AS salto
          FROM v_sc_radiacion_calibrada
         WHERE "timestamp" >= %s AND "timestamp" < %s),
         ele AS (SELECT f, count(*) n,
                        mode() WITHIN GROUP (ORDER BY salto)
                            FILTER (WHERE salto > 0) AS cadencia
                   FROM ele_salto GROUP BY f),
         rad AS (SELECT f, count(*) n,
                        mode() WITHIN GROUP (ORDER BY salto)
                            FILTER (WHERE salto > 0) AS cadencia
                   FROM rad_salto GROUP BY f)
    SELECT v.fecha, v.horas_sol,
           COALESCE(ele.n, 0) AS filas_electrico, ele.cadencia AS cadencia_electrico,
           COALESCE(rad.n, 0) AS filas_radiacion, rad.cadencia AS cadencia_radiacion
      FROM ventana_solar v
      LEFT JOIN ele ON ele.f = v.fecha
      LEFT JOIN rad ON rad.f = v.fecha
     WHERE v.fecha >= %s AND v.fecha < %s
     ORDER BY v.fecha
"""

_NOTA = (
    "los dias sin una sola fila salen del calendario solar, no de las tablas de "
    "datos. Lo esperado se mide contra la cadencia REAL del periodo (`cadencia_seg`, "
    "moda de los saltos reales entre filas) y las horas de sol del dia: la cadencia "
    "cambio de 2 s a 15 s, 1 min y 5 min segun la epoca, y medir todo contra el "
    "nominal daba 4% de completitud como si se hubieran perdido datos que nunca se "
    "tomaron. `cadencia_origen` = 'nominal' avisa que el periodo no tenia ni una "
    "fila con la que medirla y se cayo a la constante. La completitud puede pasar de "
    "1 cuando "
    "el logger grabo fuera de la ventana solar del dia. `completitud` mide contra el "
    "periodo entero y `completitud_dias_con_datos` solo contra los dias que grabaron: "
    "la primera incluye el logger apagado, la segunda es la perdida de puntos real."
)


def _fecha(valor: date | str) -> date:
    """La fecha, venga como `date` o como el ISO que devuelve `db.query`."""
    return valor if isinstance(valor, date) else date.fromisoformat(str(valor)[:10])


def _fraccion(real: int, esperado: int) -> float | None:
    """La razon real/esperado, o None si no hay contra que comparar."""
    return round(real / esperado, 3) if esperado else None


def cadencia(dias: list[dict], fuente: str) -> tuple[int, str]:
    """Cada cuantos segundos hay una fila guardada, DE VERDAD, en este periodo.

    Es la moda de los saltos reales entre filas consecutivas, ponderada por filas:
    robusta frente a un dia suelto con cadencia rara, que si pesara igual que un mes
    entero desplazaria la referencia. Empate: gana la mas fina, que es la exigente.
    """
    peso: dict[int, int] = {}
    for dia in dias:
        seg = dia.get(_CAMPO_CADENCIA[fuente])
        if seg:
            peso[int(seg)] = peso.get(int(seg), 0) + (dia.get(_CAMPO_FILAS[fuente]) or 0)
    if not peso:
        return CADENCIA_NOMINAL_SEG[fuente], NOMINAL
    return max(peso.items(), key=lambda par: (par[1], -par[0]))[0], MEDIDA


def esperadas(horas_sol: float, cadencia_seg: int) -> int:
    """Lecturas que deberia tener un dia de `horas_sol` a esa cadencia."""
    return int(horas_sol * _SEGUNDOS_POR_HORA / cadencia_seg) if cadencia_seg else 0


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


def resumir(dias: list[dict], fuente: str, puntos: list[dict]) -> dict:
    """Dias de calendario, con datos, sin datos, y los huecos. Puro, sin DB.

    Lo esperado se suma de `puntos` y no se recalcula: si el resumen midiera contra
    una sola cadencia y el grafico contra la de cada periodo, los dos numeros que
    el lector ve juntos no cuadrarian.
    """
    campo = _CAMPO_FILAS[fuente]
    con_datos = sum(1 for dia in dias if dia.get(campo))
    lecturas = sum(dia.get(campo) or 0 for dia in dias)
    objetivo = sum(punto["esperadas"] for punto in puntos)
    objetivo_grabaron = sum(punto["esperadas_dias_con_datos"] for punto in puntos)
    seg, origen = cadencia(dias, fuente)
    return {
        "cadencia_seg": seg,
        "cadencia_origen": origen,
        "cadencias_seg": sorted({punto["cadencia_seg"] for punto in puntos}),
        "dias_calendario": len(dias),
        "dias_con_datos": con_datos,
        "dias_sin_datos": len(dias) - con_datos,
        "lecturas": lecturas,
        "lecturas_esperadas": objetivo,
        "completitud": _fraccion(lecturas, objetivo),
        "lecturas_esperadas_dias_con_datos": objetivo_grabaron,
        "completitud_dias_con_datos": _fraccion(lecturas, objetivo_grabaron),
        "tramos_sin_datos": tramos_sin_datos(dias, fuente),
    }


def componer(dias: list[dict], granularidad: str) -> dict:
    """Series y resumen por fuente a partir del calendario YA traido. Puro."""
    efectiva = granularidad_efectiva(granularidad)
    series = {fuente: serie(dias, efectiva, fuente) for fuente in FUENTES}
    return {
        "granularidad_serie": efectiva,
        "granularidad_degradada": efectiva != granularidad,
        "series": series,
        "resumen": {f: resumir(dias, f, series[f]) for f in FUENTES},
        "nota": _NOTA,
    }


def _consultar_dias(ventana: Ventana) -> list[dict]:
    desde, hasta = ventana.sql
    return db.query(_SQL_DIAS, (desde, hasta, desde, hasta, desde, hasta))


def calcular(ventana: Ventana) -> dict:
    """Completitud del periodo por fuente, con su bloque de confianza."""
    desde, hasta = ventana.sql
    # Las dos consultas son independientes: en fila costaban dos viajes al pooler
    # (~450 ms) sin que ninguna necesitara nada de la otra. Ver `db.en_paralelo`.
    confianza, dias = db.en_paralelo(
        lambda: contexto.confianza(desde, hasta, COLUMNAS, None),
        lambda: _consultar_dias(ventana),
    )
    return resultado.sobre(
        ventana, confianza, **componer(dias, ventana.granularidad),
    )

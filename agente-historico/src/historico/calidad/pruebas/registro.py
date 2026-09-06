"""El CATALOGO de pruebas y el corredor que lo recorre.

Cinco familias: las cuatro del documento de evaluacion, que juzgan el DATO, y
`disponibilidad`, que juzga el EQUIPO. La quinta se agrego exactamente igual que
cualquier otra (una funcion con la firma del contrato y un renglon aca), que es
la propiedad que este modulo existe para tener.

Agregar una prueba es escribir una funcion con la firma del contrato y anotarla
en `CATALOGO_PRUEBAS`. Nadie llama a las pruebas por su nombre: el corredor las
recorre. Eso es lo que hace que la familia crezca sin que haya que tocar el
barrido, la consola ni la herramienta del agente.

## Por que el resultado no es solo una lista de hallazgos

Una prueba que no aparece en el informe se lee como una prueba que paso. Con
cuatro de las nueve pruebas de validez fisica sin fuente en la base, esa lectura
convertiria el informe en una mentira comoda. Por eso `correr()` devuelve una
`Evaluacion` POR CADA par (prueba, serie), con estado explicito, exista o no un
hallazgo. Los hallazgos son un subconjunto: lo que ademas hay que persistir.

## Por que cada prueba tiene un `tipo` distinto

La PK de `hallazgos_calidad` es (fecha, fuente, variable, tipo). Dos pruebas que
compartieran tipo se pisarian la fila en el `ON CONFLICT` del barrido y una de
las dos desapareceria del store sin error. `TIPOS` es la lista completa, y es lo
que el barrido necesita para limpiar su rango sin borrar lo ajeno.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from historico.analitica import catalogo
from historico.calidad.pruebas import anomalias, completitud, consistencia_temporal
from historico.calidad.pruebas import disponibilidad, validez_fisica
from historico.calidad.pruebas.contrato import (
    AVISO, EVALUADA, FUENTE_SIN_ORIGEN, NO_APLICA, SIN_DATOS, SIN_FUENTE,
    TIPO_SIN_FUENTE, Contexto, Hallazgo, NoAplica, Prueba, Serie,
)

COMPLETITUD = "completitud"
VALIDEZ_FISICA = "validez_fisica"
CONSISTENCIA_TEMPORAL = "consistencia_temporal"
ANOMALIAS = "anomalias"
# Familia aparte y no una quinta prueba de validez fisica: las cuatro de arriba
# juzgan el DATO y esta juzga el EQUIPO. Que sean familias distintas es lo que le
# permite a `calidad.contexto` dejar la disponibilidad fuera del veredicto de
# calidad sin perderla de vista. Ver `disponibilidad.py`.
DISPONIBILIDAD = "disponibilidad"


@dataclass(frozen=True)
class PruebaRegistrada:
    """Una prueba con su identidad: como se llama, de que familia y que tipo deja."""

    nombre: str
    familia: str
    tipo: str
    ejecutar: Prueba


@dataclass(frozen=True)
class Evaluacion:
    """El resultado de correr UNA prueba sobre UNA serie. Nunca se omite.

    `origen` viaja aca y no solo en el hallazgo porque cambia lo que la prueba
    PUEDE decir: sobre una vista corregida la validez fisica no mide nada, y
    sobre una variable derivada mide un numero calculado, no una lectura. Sin ese
    dato, tres resultados muy distintos se leen igual.
    """

    prueba: str
    familia: str
    variable: str
    fuente: str
    origen: str
    estado: str
    motivo: str | None
    hallazgos: tuple[Hallazgo, ...]


CATALOGO_PRUEBAS: tuple[PruebaRegistrada, ...] = (
    # ── Familia 1: completitud ──────────────────────────────────────────────
    PruebaRegistrada("valores_nan", COMPLETITUD, "valor_nan", completitud.valores_nan),
    PruebaRegistrada("valores_nulos", COMPLETITUD, "valor_nulo", completitud.valores_nulos),
    PruebaRegistrada("timestamps_faltantes", COMPLETITUD, "timestamp_faltante",
                     completitud.timestamps_faltantes),
    PruebaRegistrada("minutos_faltantes", COMPLETITUD, "minuto_faltante",
                     completitud.minutos_faltantes),
    PruebaRegistrada("parametro_faltante", COMPLETITUD, "parametro_faltante",
                     completitud.parametro_faltante),
    PruebaRegistrada("dispositivos_faltantes", COMPLETITUD, "dispositivo_faltante",
                     completitud.dispositivos_faltantes),
    # ── Familia 2: validez fisica ───────────────────────────────────────────
    PruebaRegistrada("bajo_minimo", VALIDEZ_FISICA, "bajo_minimo_fisico",
                     validez_fisica.bajo_minimo),
    PruebaRegistrada("sobre_maximo", VALIDEZ_FISICA, "sobre_maximo_fisico",
                     validez_fisica.sobre_maximo),
    PruebaRegistrada("irradiancia_de_noche", VALIDEZ_FISICA, "irradiancia_nocturna",
                     validez_fisica.irradiancia_de_noche),
    # ── Familia 3: consistencia temporal ────────────────────────────────────
    PruebaRegistrada("timestamps_duplicados", CONSISTENCIA_TEMPORAL, "timestamp_duplicado",
                     consistencia_temporal.timestamps_duplicados),
    PruebaRegistrada("intervalo_excesivo", CONSISTENCIA_TEMPORAL, "intervalo_excesivo",
                     consistencia_temporal.intervalo_excesivo),
    PruebaRegistrada("marcas_inestables", CONSISTENCIA_TEMPORAL, "marca_inestable",
                     consistencia_temporal.marcas_inestables),
    # ── Familia 4: anomalias estadisticas ───────────────────────────────────
    PruebaRegistrada("salto_excesivo", ANOMALIAS, "salto_excesivo", anomalias.salto_excesivo),
    PruebaRegistrada("flatline", ANOMALIAS, "flatline", anomalias.flatline),
    PruebaRegistrada("outlier_iqr", ANOMALIAS, "outlier_iqr", anomalias.outlier_iqr),
    PruebaRegistrada("ruido_excesivo", ANOMALIAS, "ruido_excesivo", anomalias.ruido_excesivo),
    # ── Familia 5: disponibilidad del equipo ────────────────────────────────
    PruebaRegistrada("inversor_sin_acoplar", DISPONIBILIDAD, disponibilidad.TIPO,
                     disponibilidad.inversor_sin_acoplar),
)

# Los tipos que produce ESTE paquete, incluido el estructural. El barrido los
# necesita para limpiar su rango sin llevarse por delante lo que escriben otros
# detectores (le paso lo mismo con `kt_imposible` de `cielo.py`).
TIPOS: tuple[str, ...] = tuple(p.tipo for p in CATALOGO_PRUEBAS) + (TIPO_SIN_FUENTE,)


@dataclass(frozen=True)
class Corrida:
    """Lo que dejo recorrer el catalogo: el informe completo y lo persistible."""

    evaluaciones: tuple[Evaluacion, ...]
    sin_fuente: tuple[Hallazgo, ...]

    @property
    def hallazgos(self) -> list[Hallazgo]:
        de_pruebas = [h for e in self.evaluaciones for h in e.hallazgos]
        return list(self.sin_fuente) + de_pruebas

    def filas(self) -> list[tuple]:
        """Listas para el INSERT de `barrido.py`, en el orden de sus columnas."""
        return [h.como_fila() for h in self.hallazgos]

    @property
    def resumen(self) -> dict:
        conteo = {estado: 0 for estado in (EVALUADA, SIN_FUENTE, SIN_DATOS, NO_APLICA)}
        por_familia: dict[str, dict] = {}
        for evaluacion in self.evaluaciones:
            conteo[evaluacion.estado] += 1
            familia = por_familia.setdefault(
                evaluacion.familia, {"pruebas": 0, "con_hallazgos": 0, SIN_FUENTE: 0})
            familia["pruebas"] += 1
            familia["con_hallazgos"] += bool(evaluacion.hallazgos)
            familia[SIN_FUENTE] += evaluacion.estado == SIN_FUENTE
        return {"evaluaciones": len(self.evaluaciones), **conteo,
                "hallazgos": len(self.hallazgos), "por_familia": por_familia,
                "sin_vigilancia_previa": self.sin_vigilancia_previa}

    @property
    def sin_vigilancia_previa(self) -> list[str]:
        """Las variables que el barrido NO revisaba antes de esta corrida.

        Mismo modo de fallo que `sin_fuente`, una capa mas arriba: para el
        `albedo`, las cuatro SP722, `cs_ghi_wm2`, `kt_star` y las dos POA, el
        store de hallazgos siempre estuvo vacio porque nadie las miraba, no
        porque estuvieran sanas. Quien lea esta corrida tiene que saber que para
        esas variables es la PRIMERA revision, no una confirmacion.
        """
        claves = {e.variable for e in self.evaluaciones}
        return catalogo.sin_vigilancia(*sorted(claves)) if claves else []


def correr(series: Iterable[Serie], contexto: Contexto | None = None,
           pruebas: Sequence[PruebaRegistrada] = CATALOGO_PRUEBAS) -> Corrida:
    """Recorre el catalogo sobre cada serie. Sin base de datos y sin efectos."""
    contexto = contexto or Contexto()
    evaluaciones: list[Evaluacion] = []
    huecos: list[Hallazgo] = []

    for serie in series:
        if not serie.variable.disponible:
            huecos.append(_hallazgo_sin_fuente(serie, pruebas))
        for prueba in pruebas:
            evaluaciones.append(_evaluar(prueba, serie, contexto))
    return Corrida(tuple(evaluaciones), tuple(huecos))


def _evaluar(prueba: PruebaRegistrada, serie: Serie, contexto: Contexto) -> Evaluacion:
    def resultado(estado, motivo=None, hallazgos=()):
        return Evaluacion(prueba.nombre, prueba.familia, serie.variable.clave,
                          serie.fuente, serie.origen, estado, motivo,
                          tuple(hallazgos))

    if not serie.variable.disponible:
        return resultado(SIN_FUENTE, serie.variable.fuente_ausente)
    if serie.vacia:
        return resultado(SIN_DATOS, "la serie no trae ni una lectura en el rango")
    try:
        return resultado(EVALUADA, hallazgos=prueba.ejecutar(serie, contexto))
    except NoAplica as motivo:
        return resultado(NO_APLICA, motivo.motivo)


def _hallazgo_sin_fuente(serie: Serie, pruebas: Sequence[PruebaRegistrada]) -> Hallazgo:
    """UNA fila por variable sin origen, no una por prueba.

    Una por prueba colisionaria contra si misma en la PK del store (mismo dia,
    misma variable, mismo tipo). El detalle lista las pruebas que quedaron sin
    correr, que es la informacion que se perderia al agrupar.
    """
    return Hallazgo(
        fecha=serie.fecha, fuente=FUENTE_SIN_ORIGEN, variable=serie.variable.clave,
        tipo=TIPO_SIN_FUENTE, severidad=AVISO, n_afectadas=None,
        detalle={"motivo": serie.variable.fuente_ausente,
                 "etiqueta": serie.variable.etiqueta,
                 "pruebas_sin_correr": [p.nombre for p in pruebas],
                 "nota": "el documento pide estas pruebas y la base no tiene el dato; "
                         "queda medido para que el hueco no se lea como un aprobado"})

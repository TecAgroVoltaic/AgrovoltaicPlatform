"""El SQL de las pruebas. Trae la serie; NO decide nada.

La separacion es la misma de `calidad.contexto.reducir()` y por la misma razon:
el criterio es lo unico discutible con el equipo, es donde viven los defectos y
tiene que poder probarse entero sin base de datos. Aca solo se leen filas.

## La allowlist

Ningun nombre de relacion ni de columna se arma con texto de nadie: TODOS salen
de `catalogo.obtener(clave)`, que es la allowlist del proyecto, incluidos los del
crudo (`Variable.origen_crudo`). El rango va siempre por `%s`. Una clave que no
este en el catalogo revienta antes de tocar SQL.

## Corregido para analizar, crudo para validar

El catalogo registra los DOS origenes de cada variable, y la diferencia decide si
una prueba significa algo. Las vistas corregidas anulan lo que cae fuera de
rango, asi que la familia de validez fisica leida contra ellas da cero valores
imposibles porque la vista los borro, no porque el sensor estuviera bien. Por eso
`crudo=True` existe y por eso la serie viaja etiquetada con su origen: la prueba
que no puede correr sobre un dato ya corregido se declara `no_aplica` en vez de
devolver una lista vacia, que se leeria como un aprobado.

`kt_star` es el unico caso con fuente y sin crudo (es un cociente que la vista
calcula al vuelo): se sirve de la vista con origen DERIVADA, que es lo que le
permite a la evaluacion decir que no es una lectura de sensor.

## Por que la `fuente` del hallazgo es la tabla, no la vista

`calidad.contexto` cruza los hallazgos contra el conteo de filas por
(fecha, fuente) usando `radiacion_sc_15s` y `monitoreo_sc_electrico`: un hallazgo
con el nombre de la vista no cruzaria con nada y el dia se veria limpio. Por eso
la fuente sale de `relacion_cruda`, que es el nombre con que el barrido ya
etiqueta lo suyo.

## Zona horaria: se le quita la etiqueta, no se convierte

`db.query` devuelve los timestamps como texto ISO con `+00`, y ese `+00` MIENTE:
lo guardado es el reloj de pared local de Costa Rica. Aca se descarta la etiqueta
para trabajar con datetimes naive comparables entre si y contra `ventana_solar`,
que esta guardada con la misma convencion. Quitar una etiqueta falsa no es
convertir de zona: convertir correria seis horas todos los perfiles del dia.

## Por que existe `series_de` ademas de `serie`

Contra el pooler de Supabase el coste dominante es la LATENCIA del viaje, no la
consulta: el barrido necesita veintidos variables sobre el mismo rango y pedirlas
de a una son veintidos viajes para traer, en cinco de esas veces, columnas de la
misma tabla. `series_de` trae todas las columnas de una relacion en un SELECT y
reparte el resultado en N `Serie`. Es el mismo SQL con mas columnas.

## Las dos consultas que no devuelven una `Serie`

`ventanas_solares` y `radiacion_por_bin` arman el CONTEXTO, no la serie que se
juzga: la primera dice cuando amanecio cada dia (la usa la irradiancia nocturna) y
la segunda trae la radiacion promediada por ventana de 5 minutos, que es con lo
que la familia de disponibilidad gradua la severidad de un inversor caido. Sin la
segunda, esa familia corre igual pero saca TODO con motivo `sin_irradiancia`: el
hallazgo aparece y la graduacion, que es su aporte central, se pierde en silencio.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime

from historico import db
from historico.analitica import catalogo
from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import (
    CORREGIDA, CRUDO, DERIVADA, FUENTE_SIN_ORIGEN, Serie, VentanaSolar,
)

# Relaciones que traen `intervalo_original_seg` (la cadencia declarada fila por
# fila). `radiacion_sc_poa` y `radiacion_sc_clearsky` son tablas MODELADAS y no la
# tienen: para ellas la cadencia se infiere del propio dia.
RELACIONES_CON_INTERVALO = ("v_sc_electrico_corregido", "v_sc_radiacion_calibrada",
                            "v_sc_radiacion_corregida", "monitoreo_sc_electrico",
                            "radiacion_sc_15s")

# La variable con que `disponibilidad` gradua la severidad de un apagon. Va por
# clave del catalogo y no por nombre de tabla para que la relacion y la columna
# salgan de la allowlist, como todo lo demas del modulo.
CLAVE_DE_LA_RADIACION = "irradiancia_incidente_wm2"

# El origen de `date_bin`, el mismo de la medicion y de `sql/002`. Con un tamaño
# de bin que divide a la hora, el origen solo tiene que caer en un limite de
# ventana: cualquier medianoche sirve, y por eso da igual en que zona lo
# interprete la sesion (los husos son horas enteras). Se fija igual, y no se deja
# al azar, para que este mapa y el que arma `disponibilidad` en memoria coincidan.
ORIGEN_DEL_BIN = "2024-01-01 00:00:00+00"


def _sin_etiqueta(valor) -> datetime:
    """El timestamp del store como datetime naive. Ver el docstring del modulo."""
    marca = datetime.fromisoformat(valor) if isinstance(valor, str) else valor
    return marca.replace(tzinfo=None)


def _origen(variable, crudo: bool) -> tuple[str, str, str]:
    """(relacion, columna, etiqueta de origen) segun lo que declare el catalogo."""
    if not crudo:
        return variable.relacion, variable.columna, CORREGIDA
    sin_corregir = variable.origen_crudo
    if sin_corregir is None:
        # Variable derivada: no hay crudo que pedir. Se sirve de la vista, pero
        # etiquetada, para que la evaluacion no la trate como una lectura.
        return variable.relacion, variable.columna, DERIVADA
    return (*sin_corregir, CRUDO)


def serie(clave: str, desde: date | str, hasta: date | str,
          crudo: bool = False) -> Serie:
    """Las lecturas de una variable en [desde, hasta), listas para las pruebas.

    `crudo=True` lee la tabla sin corregir que registra el catalogo, que es lo
    unico que hace medible la familia de validez fisica.
    """
    variable = catalogo.obtener(clave)
    if not variable.disponible:
        # Sin origen no hay consulta que hacer, y la serie vacia es la entrada
        # correcta: el corredor la marca `sin_fuente` con el motivo del catalogo.
        return Serie(variable=variable, fuente=FUENTE_SIN_ORIGEN,
                     fecha=_como_fecha(desde), origen=CRUDO)

    relacion, columna, procedencia = _origen(variable, crudo)
    intervalo = ("intervalo_original_seg" if relacion in RELACIONES_CON_INTERVALO
                 else "NULL::double precision")
    filas = db.query(
        f'SELECT "timestamp" AS marca, {columna} AS valor, {intervalo} AS intervalo '
        f'  FROM {relacion} '
        f' WHERE "timestamp" >= %s AND "timestamp" < %s '
        f' ORDER BY "timestamp"',
        (desde, hasta))

    return Serie(
        variable=variable,
        fuente=variable.relacion_cruda or variable.relacion,
        fecha=_como_fecha(desde),
        origen=procedencia,
        marcas=[_sin_etiqueta(f["marca"]) for f in filas],
        valores=[f["valor"] for f in filas],
        intervalos=[f["intervalo"] for f in filas])


def series_de(relacion: str, claves: Sequence[str], desde: date | str,
              hasta: date | str, crudo: bool = False) -> list[Serie]:
    """Todas las columnas de UNA relacion en un solo SELECT: N claves, N `Serie`.

    Quien llama AGRUPA las claves por relacion; esto lo verifica en vez de
    confiar. Un grupo mal armado pediria una columna que la tabla no tiene (que
    revienta y se ve) o, peor, la misma columna con el origen equivocado, que no
    revienta: la validez fisica leida de una vista corregida sale vacia y se lee
    como un aprobado.

    Las variables sin fuente no entran aca: no hay relacion que consultar y su
    serie vacia la arma `serie()`, que es donde esta explicado por que.
    """
    if not claves:
        return []

    variables = [catalogo.obtener(c) for c in claves]
    origenes: dict[str, tuple[str, str]] = {}
    for variable in variables:
        if not variable.disponible:
            raise ValueError(
                f"{variable.clave!r} no tiene fuente ({variable.fuente_ausente}): "
                f"pedila con `serie()`, que devuelve la serie vacia que el "
                f"corredor marca `sin_fuente`")
        origen, columna, procedencia = _origen(variable, crudo)
        if origen != relacion:
            raise ValueError(
                f"{variable.clave!r} vive en {origen!r} y no en {relacion!r}: "
                f"agrupa las claves por relacion antes de pedirlas juntas")
        origenes[variable.clave] = (columna, procedencia)

    # La columna se renombra a la CLAVE del catalogo: en la tabla cruda la
    # irradiancia es `irradiancia_incidente` y en el catalogo
    # `irradiancia_incidente_wm2`, asi que sin el alias habria que rehacer la
    # traduccion al repartir las filas. Los dos nombres salen de la allowlist.
    columnas = ", ".join(f"{columna} AS {clave}"
                         for clave, (columna, _) in origenes.items())
    intervalo = ("intervalo_original_seg" if relacion in RELACIONES_CON_INTERVALO
                 else "NULL::double precision")
    filas = db.query(
        f'SELECT "timestamp" AS marca, {columnas}, {intervalo} AS intervalo '
        f'  FROM {relacion} '
        f' WHERE "timestamp" >= %s AND "timestamp" < %s '
        f' ORDER BY "timestamp"',
        (desde, hasta))

    # Marcas e intervalos son los MISMOS para todas las columnas de la relacion, y
    # las listas se comparten en vez de copiarse: `Serie` es inmutable y ninguna
    # prueba las escribe. Con 94.868 filas repartidas en seis variables, rehacerlas
    # por variable multiplica por seis la memoria sin cambiar un solo valor.
    marcas = [_sin_etiqueta(f["marca"]) for f in filas]
    intervalos = [f["intervalo"] for f in filas]
    return [
        Serie(variable=variable,
              fuente=variable.relacion_cruda or variable.relacion,
              fecha=_como_fecha(desde),
              origen=origenes[variable.clave][1],
              marcas=marcas,
              valores=[f[variable.clave] for f in filas],
              intervalos=intervalos)
        for variable in variables
    ]


def ventanas_solares(desde: date | str, hasta: date | str) -> dict[date, VentanaSolar]:
    """Amanecer y atardecer por dia. Lo puebla `calidad/sol.py` con pvlib."""
    filas = db.query(
        "SELECT fecha, amanecer, atardecer FROM ventana_solar "
        " WHERE fecha >= %s AND fecha < %s", (desde, hasta))
    return {_como_fecha(f["fecha"]): VentanaSolar(_sin_etiqueta(f["amanecer"]),
                                                  _sin_etiqueta(f["atardecer"]))
            for f in filas}


def radiacion_por_bin(desde: date | str,
                      hasta: date | str) -> dict[datetime, float]:
    """La radiacion promediada por ventana de 5 min: el mapa de `ContextoDisponibilidad`.

    Es la unica consulta del paquete que NO devuelve una `Serie`, y no lo es por
    capricho: la familia de disponibilidad no analiza la radiacion, la usa para
    GRADUAR la severidad de un hallazgo electrico. Lo que necesita es el promedio
    por ventana, no las 94.868 lecturas.

    ## Por BIN, jamas por igualdad de timestamp

    Es el mismo `avg(...) GROUP BY date_bin('5 minutes', ...)` de
    `docs/referencia/medicion-inversor-caido.md`, y es la propiedad que hay que
    proteger: emparejando por igualdad exacta se encuentra radiacion para 818 de
    las 6.330 lecturas marcadas (se pierde el 87,1 %); por bin de 5 min se
    emparejan 5.979, o sea el 94,5 %. Las dos tablas no comparten reloj (lo
    electrico va a 5 min, la radiacion a 15 s con jitter). El error ni siquiera se
    ve en la salida: el hallazgo aparece igual, con la severidad equivocada.

    El promedio se hace en SQL y no en memoria (`disponibilidad.irradiancia_por_bin`
    hace lo mismo sobre una serie ya traida) por el motivo de siempre contra el
    pooler: un viaje que devuelve un renglon por ventana en vez de uno por lectura.
    Las dos implementaciones tienen que dar el MISMO mapa, y por eso el tamaño del
    bin sale de `umbrales` en las dos.

    ## De donde sale, y por que ese origen es el correcto

    Del catalogo, como todo el resto del modulo: `v_sc_radiacion_calibrada`, que
    aplica factor 1,0 sobre exactamente la misma expresion que
    `v_sc_radiacion_corregida` (la relacion con que se hizo la medicion), asi que
    la escala del umbral de 300 W/m2 se conserva.

    Esa vista devuelve NULL para todo lo anterior al 2025-07-01 por decision del
    equipo, y ESO ES LO QUE SE QUIERE: los bins de esos dias no entran en el mapa,
    la prueba no encuentra con que graduar y saca el hallazgo con motivo
    `sin_irradiancia`. Son 46 de los 274 dias con dato electrico, con 3 apagones de
    dia entero adentro. Callarlos seria perderlos.

    Zona horaria: ninguna conversion, igual que en todo el paquete. El bin se
    calcula sobre la marca tal como esta guardada y se le quita la etiqueta `+00`
    al volver, que es lo mismo que se le hace a las marcas de las series: los dos
    lados del emparejamiento quedan en el mismo reloj de pared.
    """
    variable = catalogo.obtener(CLAVE_DE_LA_RADIACION)
    # Ninguno de los literales interpolados viene de afuera: dos salen del catalogo
    # (la allowlist) y el tercero es un entero de `umbrales`. El rango va por %s.
    filas = db.query(
        f'SELECT date_bin(INTERVAL \'{int(umbrales.BIN_DE_EMPAREJAMIENTO_SEG)} seconds\', '
        f'                "timestamp", TIMESTAMPTZ \'{ORIGEN_DEL_BIN}\') AS bin, '
        f'       avg({variable.columna}) AS ghi '
        f'  FROM {variable.relacion} '
        f' WHERE "timestamp" >= %s AND "timestamp" < %s '
        f' GROUP BY 1',
        (desde, hasta))
    # Un bin cuyo promedio es NULL (todas sus lecturas anuladas) se OMITE en vez de
    # guardarse en None: la prueba distingue "no hay entrada" de "hay entrada", y
    # una entrada nula haria pasar por medido lo que nadie midio.
    return {_sin_etiqueta(f["bin"]): f["ghi"] for f in filas if f["ghi"] is not None}


def _como_fecha(valor) -> date:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return date.fromisoformat(str(valor)[:10])

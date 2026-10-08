"""Las dos consultas que arman el CONTEXTO de las pruebas, no la serie que se juzga."""
from __future__ import annotations

from datetime import date, datetime

from historico import db
from historico.analitica import catalogo
from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.consultas.comun import _como_fecha, _sin_etiqueta
from historico.calidad.pruebas.contrato import VentanaSolar

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

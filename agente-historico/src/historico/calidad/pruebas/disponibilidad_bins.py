"""El cruce de lo electrico con la irradiancia, por BIN de 5 min (familia 5 y 6).

Es el hallazgo central del proyecto y se reprodujo otra vez aca. Emparejando por
igualdad de timestamp se encuentra irradiancia para **818 de las 6.330** lecturas
marcadas (se pierde el 87,1 %); con `date_bin` de 5 minutos se emparejan **5.979
(94,5 %)**. Las dos tablas no comparten reloj: lo electrico va a 5 min y la
radiacion a 15 s con jitter. `tests/test_calidad_disponibilidad.py` fija esta
propiedad para que el error no se pueda volver a cometer.

Se usa a traves de `disponibilidad`, que reexporta lo de aca; `entre_sensores` lee
el MISMO mapa para cruzar la temperatura de modulo con el sol.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import Contexto, es_valor


@dataclass(frozen=True)
class ContextoDisponibilidad(Contexto):
    """El `Contexto` comun mas la irradiancia con que se gradua la severidad.

    Va como SUBCLASE y no como campo nuevo del contrato porque la irradiancia la
    necesitan dos familias de seis: quien corre el catalogo entero puede pasar esto
    y las demas ni se enteran. La sexta (`entre_sensores`) lee este MISMO mapa para
    cruzar la temperatura de modulo con el sol: un solo emparejamiento.

    El mapa esta indexado por BIN de 5 minutos (`bin_de_emparejamiento`), no por
    marca: ver el docstring de este modulo. Lo arma `irradiancia_por_bin()`.

    Que no venga NO es un error: con un `Contexto` pelado la prueba sigue marcando
    y sale toda con motivo `sin_irradiancia`, que es el comportamiento que protege
    los 3 apagones de dia entero. Degradar hacia el silencio seria lo contrario.
    """

    irradiancia_por_bin: Mapping[datetime, float] = field(default_factory=dict)


def bin_de_emparejamiento(marca: datetime) -> datetime:
    """La ventana de 5 min a la que pertenece una marca.

    Replica exactamente `date_bin('5 minutes', ts, timestamp '2024-01-01 00:00')`
    de la medicion: con origen a medianoche y un tamaño que divide a la hora,
    truncar el minuto al multiplo de 5 da el mismo bin sin depender del origen.

    ZONA HORARIA: no se convierte nada, igual que en todo el paquete. La marca es
    el reloj de pared local y el bin tambien.
    """
    tamaño = umbrales.BIN_DE_EMPAREJAMIENTO_SEG // 60
    return marca.replace(minute=marca.minute - marca.minute % tamaño,
                         second=0, microsecond=0)


def irradiancia_por_bin(marcas, valores) -> dict[datetime, float]:
    """Promedia una serie de radiacion por ventana de 5 min: el mapa del contexto.

    Es el `avg(irradiancia_incidente) GROUP BY date_bin('5 minutes', ...)` de la
    medicion, hecho en memoria. Promedio y no primera lectura: en una ventana de
    5 min entran ~1,5 muestras de radiacion (medido), y quedarse con una sola
    haria que el mismo bin diera distinto segun el orden de llegada.
    """
    suma: dict[datetime, float] = {}
    cuenta: dict[datetime, int] = {}
    for marca, valor in zip(marcas, valores):
        if not es_valor(valor):
            continue
        ventana = bin_de_emparejamiento(marca)
        suma[ventana] = suma.get(ventana, 0.0) + valor
        cuenta[ventana] = cuenta.get(ventana, 0) + 1
    return {ventana: suma[ventana] / cuenta[ventana] for ventana in suma}

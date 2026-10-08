"""La unica puerta que lee y escribe `alertas`, `alertas_eventos` y `alertas_evaluaciones`.

Toda escritura de varios pasos va por `db.transaccion()`: una alerta sin su
evento `creada`, o una transicion sin su evento, seria una linea de tiempo que
miente. Las lecturas van por el pool de solo lectura, como el resto de la API.

Concurrencia, que es donde un store de estados se rompe en silencio:
  * las transiciones bloquean la fila (`FOR UPDATE`) antes de validar, asi que
    dos personas no pueden resolver y descartar la misma alerta a la vez;
  * el generador toma un candado consultivo de transaccion: dos evaluaciones
    simultaneas se ordenan en vez de crear la misma alerta dos veces. El indice
    unico de abiertas por clave queda de ultima red.

La persistencia esta repartida por responsabilidad y este modulo la reexporta
entera, asi que se sigue usando `store.<funcion>`: lecturas en `store_lectura`,
el generador (estado + plan en la misma transaccion) en `store_evaluacion`, las
constantes SQL en `store_sql`. Aca queda la transicion de una alerta.
"""
from __future__ import annotations

import json
from datetime import date

from historico import db
from historico.alertas import ciclo
from historico.alertas.modelo import AlertaAbiertaExistente, AlertaInexistente
from historico.alertas.store_evaluacion import (  # noqa: F401
    _escribir_plan, _estado_actual, aplicar_evaluacion,
)
from historico.alertas.store_lectura import (  # noqa: F401
    extension_de_hallazgos, hallazgos, listar, obtener, resumen,
)
from historico.alertas.store_sql import (  # noqa: F401
    _CANDADO_EVALUACION, _COLUMNAS_EVENTO, _INSERTAR_EVENTO, AUTOR_GENERADOR, COLUMNAS,
)


def transicionar(alerta_id: int, accion: ciclo.Accion, nota: str | None, autor: str,
                 proxima_revision: date | None = None) -> dict:
    """Aplica la accion y deja su evento, o no hace nada y levanta el error.

    `proxima_revision`: el seguimiento la fija (o la borra si no viene), cerrar la
    borra porque ya no hay nada que revisar, y el resto no la toca.
    """
    with db.transaccion() as tx:
        actual = tx.uno("SELECT id, clave, estado FROM alertas WHERE id = %s FOR UPDATE",
                        (alerta_id,))
        if not actual:
            raise AlertaInexistente(alerta_id)
        paso = ciclo.transicion(actual["estado"], accion)
        if paso.destino in ciclo.ABIERTOS and actual["estado"] in ciclo.CERRADOS:
            otra = tx.uno("SELECT id FROM alertas WHERE clave = %s AND estado = ANY(%s) "
                          "AND id <> %s", (actual["clave"], list(ciclo.ABIERTOS), alerta_id))
            if otra:
                raise AlertaAbiertaExistente(alerta_id, otra["id"])
        fijar_revision = (accion is ciclo.Accion.SEGUIMIENTO
                          or paso.destino in ciclo.CERRADOS)
        alerta = tx.uno(
            f"UPDATE alertas SET estado = %s, actualizada_en = now(), "
            f"       proxima_revision = CASE WHEN %s THEN %s::date ELSE proxima_revision END "
            f" WHERE id = %s RETURNING {COLUMNAS}",
            (paso.destino, fijar_revision,
             proxima_revision if accion is ciclo.Accion.SEGUIMIENTO else None, alerta_id))
        datos = {"de": actual["estado"], "a": paso.destino}
        if proxima_revision:
            datos["proxima_revision"] = proxima_revision.isoformat()
        tx.query(_INSERTAR_EVENTO, (alerta_id, paso.evento, nota, autor, json.dumps(datos)))
    return alerta

"""El store de alertas contra una transaccion falsa: que escribe, en que orden, y que NO.

No hay base: `db.transaccion` se sustituye por un doble que anota cada sentencia y
responde filas enlatadas segun un fragmento del SQL. Lo que se fija es lo que una
base de verdad no dejaria ver facil: que una transicion invalida no escribe nada,
que la fila se bloquea antes de validar y que el generador toma su candado.

Estructura Given-When-Then.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date

import pytest

from historico import db
from historico.alertas import ciclo, store
from historico.alertas.ciclo import Accion
from historico.alertas.modelo import (
    AlertaAbiertaExistente, AlertaInexistente, NuevaAlerta, Plan,
)

DIA = date(2026, 8, 26)


class TxFalsa:
    def __init__(self, respuestas: dict[str, list[dict]]) -> None:
        self.respuestas = respuestas
        self.sentencias: list[str] = []

    def query(self, sql, params=()):
        self.sentencias.append(sql)
        return next((filas for fragmento, filas in self.respuestas.items()
                     if fragmento in sql), [])

    def uno(self, sql, params=()):
        filas = self.query(sql, params)
        return filas[0] if filas else {}

    def ejecutar_muchos(self, sql, filas):
        if filas:
            self.sentencias.append(sql)
        return len(filas)

    def escribio(self) -> bool:
        return any(s.lstrip().startswith(("UPDATE", "INSERT")) for s in self.sentencias)


@pytest.fixture
def tx(monkeypatch):
    falsa = TxFalsa({})

    @contextmanager
    def transaccion():
        yield falsa

    monkeypatch.setattr(db, "transaccion", transaccion)
    return falsa


def _actual(estado: str) -> dict:
    return {"id": 1, "clave": "saturado:x:temp_vertical", "estado": estado}


def test_transicion_valida_bloquea_la_fila_actualiza_y_deja_evento(tx):
    # Given
    tx.respuestas = {"FOR UPDATE": [_actual(ciclo.NUEVA)],
                     "UPDATE alertas": [{"id": 1, "estado": ciclo.RECONOCIDA}]}

    # When
    alerta = store.transicionar(1, Accion.RECONOCER, "visto", "isaac")

    # Then en ese orden: bloquear, actualizar, registrar el evento
    assert alerta["estado"] == ciclo.RECONOCIDA
    assert ["FOR UPDATE" in tx.sentencias[0], tx.sentencias[1].startswith("UPDATE"),
            tx.sentencias[2].startswith("INSERT INTO alertas_eventos")] == [True] * 3


def test_transicion_invalida_no_escribe_nada(tx):
    # Given una descartada
    tx.respuestas = {"FOR UPDATE": [_actual(ciclo.DESCARTADA)]}

    # When / Then
    with pytest.raises(ciclo.TransicionInvalida):
        store.transicionar(1, Accion.RESOLVER, None, "consola")
    assert not tx.escribio()


def test_transicion_sobre_id_inexistente(tx):
    with pytest.raises(AlertaInexistente):
        store.transicionar(9, Accion.RECONOCER, None, "consola")
    assert not tx.escribio()


def test_reabrir_con_otra_abierta_de_la_misma_clave_no_escribe(tx):
    # Given la alerta resuelta y otra abierta con su clave
    tx.respuestas = {"FOR UPDATE": [_actual(ciclo.RESUELTA)], "id <> %s": [{"id": 2}]}

    # When / Then
    with pytest.raises(AlertaAbiertaExistente):
        store.transicionar(1, Accion.REABRIR, None, "consola")
    assert not tx.escribio()


def test_la_evaluacion_toma_el_candado_crea_y_registra_la_corrida(tx):
    # Given un plan con una alerta nueva
    tx.respuestas = {"INSERT INTO alertas (": [{"id": 7}]}
    nueva = NuevaAlerta("c", "saturado", "aviso", "t", "d", "f", "v", DIA, DIA, 1,
                        {"fechas": [DIA.isoformat()]})

    # When
    plan = store.aplicar_evaluacion(["c"], lambda estado: Plan(crear=(nueva,)), DIA, DIA)

    # Then
    assert plan.crear == (nueva,)
    assert "pg_advisory_xact_lock" in tx.sentencias[0]
    assert any(s.startswith("INSERT INTO alertas (") for s in tx.sentencias)
    assert any(s.startswith("INSERT INTO alertas_eventos") for s in tx.sentencias)
    assert tx.sentencias[-1].startswith("INSERT INTO alertas_evaluaciones")

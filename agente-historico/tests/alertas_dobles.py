"""Doble en memoria de `historico.alertas.store` para probar sin base.

No reimplementa ninguna decision: las transiciones las valida `ciclo` y el plan lo
arma `evaluar.planificar`, los dos reales. El doble solo GUARDA lo que el store
real escribiria, con la misma forma de fila que devuelve `db` (fechas ISO).
"""
from __future__ import annotations

from datetime import date
from itertools import count

from historico.alertas import ciclo, store
from historico.alertas.modelo import (
    AlertaAbierta, AlertaAbiertaExistente, AlertaInexistente, EstadoActual,
)
from historico.calidad.pruebas.contrato import Hallazgo

AHORA = "2026-10-06T12:00:00+00:00"
FUNCIONES = ("hallazgos", "extension_de_hallazgos", "aplicar_evaluacion", "transicionar",
             "obtener", "resumen", "listar")


class AlmacenEnMemoria:
    def __init__(self, hallazgos: list[Hallazgo] = ()) -> None:
        self.hallazgos_calidad = list(hallazgos)
        self.alertas: dict[int, dict] = {}
        self.eventos: list[dict] = []
        self.evaluaciones: list[dict] = []
        self.listados: list[tuple] = []
        self._ids = count(1)

    def instalar(self, monkeypatch) -> AlmacenEnMemoria:
        for nombre in FUNCIONES:
            monkeypatch.setattr(store, nombre, getattr(self, nombre))
        return self

    # ── Lectura ──────────────────────────────────────────────────────────────
    def hallazgos(self, desde, hasta, tipos):
        return [h for h in self.hallazgos_calidad
                if desde <= h.fecha < hasta and h.tipo in tipos]

    def extension_de_hallazgos(self):
        fechas = [h.fecha for h in self.hallazgos_calidad]
        return (min(fechas), max(fechas)) if fechas else None

    def obtener(self, alerta_id):
        if alerta_id not in self.alertas:
            raise AlertaInexistente(alerta_id)
        eventos = [{k: v for k, v in e.items() if k != "alerta_id"}
                   for e in self.eventos_de(alerta_id)]
        return dict(self.alertas[alerta_id]), eventos

    def eventos_de(self, alerta_id) -> list[dict]:
        return [e for e in self.eventos if e["alerta_id"] == alerta_id]

    def resumen(self):
        por_estado = {e: sum(a["estado"] == e for a in self.alertas.values())
                      for e in ciclo.ESTADOS}
        return {"por_estado": por_estado, "abiertas_graves": 0,
                "abiertas_total": sum(por_estado[e] for e in ciclo.ABIERTOS),
                "ultima_evaluacion": AHORA if self.evaluaciones else None}

    def listar(self, donde, params, orden, limite, offset):
        self.listados.append((donde, list(params), orden, limite, offset))
        filas = list(self.alertas.values())
        return len(filas), filas[offset:offset + limite]

    # ── Escritura ────────────────────────────────────────────────────────────
    def transicionar(self, alerta_id, accion, nota, autor, proxima_revision=None):
        if alerta_id not in self.alertas:
            raise AlertaInexistente(alerta_id)
        alerta = self.alertas[alerta_id]
        paso = ciclo.transicion(alerta["estado"], accion)
        if paso.destino in ciclo.ABIERTOS and alerta["estado"] in ciclo.CERRADOS:
            for otra in self.alertas.values():
                if otra["clave"] == alerta["clave"] and otra["estado"] in ciclo.ABIERTOS:
                    raise AlertaAbiertaExistente(alerta_id, otra["id"])
        datos = {"de": alerta["estado"], "a": paso.destino}
        alerta["estado"] = paso.destino
        if accion is ciclo.Accion.SEGUIMIENTO:
            alerta["proxima_revision"] = proxima_revision and proxima_revision.isoformat()
        self._evento(alerta_id, paso.evento, nota, autor, datos)
        return dict(alerta)

    def aplicar_evaluacion(self, claves, planificar, desde, hasta):
        plan = planificar(self._estado(claves))
        for nueva in plan.crear:
            alerta_id = next(self._ids)
            self.alertas[alerta_id] = {
                "id": alerta_id, "clave": nueva.clave, "tipo": nueva.tipo,
                "severidad": nueva.severidad, "estado": ciclo.NUEVA, "titulo": nueva.titulo,
                "descripcion": nueva.descripcion, "fuente": nueva.fuente,
                "variable": nueva.variable, "fecha_inicio": nueva.fecha_inicio.isoformat(),
                "fecha_fin": nueva.fecha_fin.isoformat(), "ocurrencias": nueva.ocurrencias,
                "evidencia": nueva.evidencia, "proxima_revision": None}
            self._evento(alerta_id, ciclo.EVENTO_CREADA, None, store.AUTOR_GENERADOR, {})
        for suma in plan.sumar:
            alerta = self.alertas[suma.alerta_id]
            alerta.update(fecha_inicio=suma.fecha_inicio.isoformat(),
                          fecha_fin=suma.fecha_fin.isoformat(),
                          ocurrencias=suma.ocurrencias, evidencia=suma.evidencia)
            for fecha in suma.fechas_nuevas:
                self._evento(suma.alerta_id, ciclo.EVENTO_OCURRENCIA, None,
                             store.AUTOR_GENERADOR, {"fecha": fecha.isoformat()})
        for nota in plan.notas:
            self._evento(nota.alerta_id, ciclo.EVENTO_NOTA, nota.texto, store.AUTOR_GENERADOR,
                         {"sin_ocurrencias_desde": nota.sin_ocurrencias_desde.isoformat()})
        self.evaluaciones.append({"desde": desde, "hasta": hasta})
        return plan

    def _estado(self, claves) -> EstadoActual:
        abiertas, fin_cerradas = {}, {}
        for a in self.alertas.values():
            if a["estado"] in ciclo.ABIERTOS and (
                    a["clave"] in claves or a["estado"] == ciclo.EN_SEGUIMIENTO):
                abiertas[a["clave"]] = AlertaAbierta(
                    a["id"], a["clave"], a["estado"], date.fromisoformat(a["fecha_inicio"]),
                    date.fromisoformat(a["fecha_fin"]), a["ocurrencias"], a["evidencia"])
            elif a["estado"] in ciclo.CERRADOS and a["clave"] in claves:
                fin = date.fromisoformat(a["fecha_fin"])
                fin_cerradas[a["clave"]] = max(fin, fin_cerradas.get(a["clave"], fin))
        notas = frozenset(
            (e["alerta_id"], date.fromisoformat(e["datos"]["sin_ocurrencias_desde"]))
            for e in self.eventos if e["tipo"] == ciclo.EVENTO_NOTA
            and e["autor"] == store.AUTOR_GENERADOR)
        return EstadoActual(abiertas, fin_cerradas, notas)

    def _evento(self, alerta_id, tipo, nota, autor, datos) -> None:
        self.eventos.append({"id": len(self.eventos) + 1, "alerta_id": alerta_id,
                             "tipo": tipo, "nota": nota, "autor": autor, "datos": datos,
                             "creado_en": AHORA})

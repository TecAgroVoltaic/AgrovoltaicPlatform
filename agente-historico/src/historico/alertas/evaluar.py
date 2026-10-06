"""El generador de alertas (contrato 4.2): hallazgos del rango -> alertas.

Dos mitades, como el resto del paquete: `planificar` DECIDE sin base de datos y
`evaluar` trae los hallazgos y le pasa el plan al store, que lo aplica entero o
nada dentro de una transaccion con candado.

Reglas de la decision:

  * agrupa los candidatos por `clave` y por dia; un dia cuenta UNA ocurrencia
    aunque lo marquen varios hallazgos (las tres variables AC de un apagon);
  * con una alerta ABIERTA de la misma clave, suma los dias que su evidencia no
    tiene todavia. Correr dos veces el mismo rango no suma nada;
  * sin abierta, crea una `nueva`. Una alerta CERRADA no se reabre sola: los dias
    hasta su `fecha_fin` ya se vieron, y solo uno posterior abre una alerta nueva;
  * una alerta `en_seguimiento` con 7 dias sin ocurrencias recibe UNA nota
    automatica por cada `fecha_fin`. El estado no cambia: resolver lo decide alguien.

Los "7 dias" se cuentan hasta el ultimo dia que el barrido cubrio, no hasta hoy:
si la carga de datos se atrasa, que no haya hallazgos no significa que el
problema se fue. Contar contra el reloj seria leer silencio como salud.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import date, timedelta
from numbers import Real

from historico.alertas import ciclo, reglas, store
from historico.alertas.modelo import (
    EstadoActual, NotaAutomatica, NuevaAlerta, Plan, SumaDeOcurrencias,
)
from historico.alertas.reglas import Candidato
from historico.analitica.ventana import VentanaInvalida

DIAS_SIN_OCURRENCIAS_PARA_SUGERIR_RESOLVER = 7


def evaluar(desde: date | None = None, hasta: date | None = None) -> dict:
    """Corre el generador sobre [desde, hasta). Idempotente.

    Sin rango, toma todo lo que cubre `hallazgos_calidad`. Con el store vacio no
    hay nada que derivar y lo dice, en vez de devolver ceros que parezcan salud.
    """
    extension = store.extension_de_hallazgos()
    if extension is None:
        return {**resumen(Plan()), "rango": None, "referencia_sin_ocurrencias": None,
                "advertencia": "hallazgos_calidad esta vacio: corre `historico todo` antes"}
    primero, ultimo_barrido = extension
    desde = desde or primero
    hasta = hasta or ultimo_barrido + timedelta(days=1)
    if hasta <= desde:
        raise VentanaInvalida("rango_vacio", f"hasta ({hasta}) tiene que ser posterior "
                                             f"a desde ({desde})")
    candidatos = reglas.candidatos(store.hallazgos(desde, hasta, reglas.TIPOS_DE_HALLAZGO))
    referencia = min(hasta - timedelta(days=1), ultimo_barrido)
    claves = sorted({c.clave for c in candidatos})
    plan = store.aplicar_evaluacion(
        claves, lambda estado: planificar(candidatos, estado, referencia), desde, hasta)
    return {**resumen(plan), "rango": {"desde": desde.isoformat(), "hasta": hasta.isoformat()},
            "referencia_sin_ocurrencias": referencia.isoformat()}


def resumen(plan: Plan) -> dict:
    return {"creadas": len(plan.crear), "actualizadas": len(plan.sumar),
            "revisadas": plan.claves_evaluadas, "notas": len(plan.notas)}


def planificar(candidatos: Iterable[Candidato], estado: EstadoActual,
               referencia: date | None) -> Plan:
    """La decision entera, pura. `referencia` = ultimo dia que el barrido cubrio."""
    por_clave: dict[str, dict[date, list[Candidato]]] = defaultdict(lambda: defaultdict(list))
    for candidato in candidatos:
        por_clave[candidato.clave][candidato.fecha].append(candidato)

    crear, sumar = [], []
    for clave, por_fecha in sorted(por_clave.items()):
        cerrada_hasta = estado.fin_cerradas.get(clave)
        vigentes = {f: c for f, c in por_fecha.items()
                    if cerrada_hasta is None or f > cerrada_hasta}
        abierta = estado.abiertas.get(clave)
        if abierta is None:
            if vigentes:
                crear.append(_nueva(vigentes))
            continue
        nuevas = {f: c for f, c in vigentes.items() if f not in abierta.fechas}
        if nuevas:
            sumar.append(SumaDeOcurrencias(
                alerta_id=abierta.id, fechas_nuevas=tuple(sorted(nuevas)),
                fecha_inicio=min(abierta.fecha_inicio, *nuevas),
                fecha_fin=max(abierta.fecha_fin, *nuevas),
                ocurrencias=abierta.ocurrencias + len(nuevas),
                evidencia=_evidencia(abierta.evidencia, nuevas)))

    return Plan(crear=tuple(crear), sumar=tuple(sumar),
                notas=tuple(_notas(estado, sumar, referencia)),
                claves_evaluadas=len(por_clave))


def _nueva(por_fecha: dict[date, list[Candidato]]) -> NuevaAlerta:
    primero = por_fecha[min(por_fecha)][0]
    definicion = primero.definicion
    return NuevaAlerta(
        clave=primero.clave, tipo=primero.tipo, severidad=definicion.severidad,
        titulo=definicion.titulo, descripcion=reglas.descripcion(primero),
        fuente=primero.fuente, variable=primero.variable,
        fecha_inicio=min(por_fecha), fecha_fin=max(por_fecha),
        ocurrencias=len(por_fecha), evidencia=_evidencia({}, por_fecha))


def _notas(estado: EstadoActual, sumar: list[SumaDeOcurrencias],
           referencia: date | None) -> list[NotaAutomatica]:
    if referencia is None:
        return []
    fin_actualizado = {s.alerta_id: s.fecha_fin for s in sumar}
    notas = []
    for alerta in estado.abiertas.values():
        if alerta.estado != ciclo.EN_SEGUIMIENTO:
            continue
        fin = fin_actualizado.get(alerta.id, alerta.fecha_fin)
        callada = (referencia - fin).days >= DIAS_SIN_OCURRENCIAS_PARA_SUGERIR_RESOLVER
        if callada and (alerta.id, fin) not in estado.notas_previas:
            notas.append(NotaAutomatica(alerta.id, fin))
    return notas


def _evidencia(previa: Mapping, por_fecha: dict[date, list[Candidato]]) -> dict:
    """Fechas, referencias a hallazgos y cifras, acumuladas sobre la evidencia previa."""
    nuevos = [c for f in sorted(por_fecha) for c in por_fecha[f]]
    fechas = set(previa.get("fechas", [])) | {f.isoformat() for f in por_fecha}
    cifras = dict(previa.get("cifras", {}))
    cifras["lecturas_afectadas"] = cifras.get("lecturas_afectadas", 0) + sum(
        c.hallazgo.n_afectadas or 0 for c in nuevos)
    for campo in (nuevos[0].definicion.cifras if nuevos else ()):
        valores = [v for v in (c.hallazgo.detalle.get(campo) for c in nuevos)
                   if isinstance(v, Real)] + [v for v in (cifras.get(campo),)
                                              if isinstance(v, Real)]
        if valores:
            cifras[campo] = max(valores)
    referencias = list(previa.get("hallazgos", [])) + [
        {"fecha": c.fecha.isoformat(), "fuente": c.hallazgo.fuente,
         "variable": c.hallazgo.variable, "tipo": c.hallazgo.tipo,
         "severidad": c.hallazgo.severidad} for c in nuevos]
    return {"fechas": sorted(fechas), "hallazgos": referencias, "cifras": cifras}

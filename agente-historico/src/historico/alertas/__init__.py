"""Alertas: lo que hay que ir a mirar, derivado de los hallazgos de calidad.

    reglas    hallazgo -> candidato a alerta (cuatro reglas v1, puras)
    evaluar   el generador: agrupa, suma ocurrencias, abre alertas, nota de 7 dias
    ciclo     la maquina de estados del seguimiento
    store     la unica puerta a `alertas`, `alertas_eventos` y `alertas_evaluaciones`
    api       los endpoints HTTP (contrato 4.5)

Contrato: `docs/referencia/contratos-asistente-alertas.md`, seccion 4.
"""

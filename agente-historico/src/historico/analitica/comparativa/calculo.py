"""Las consultas del comparativo en un solo viaje y su sobre con confianza."""
from __future__ import annotations

from historico import db
from historico.analitica import catalogo, rendimiento, resultado
from historico.analitica.comparativa.constantes import CLAVES, CLAVES_POA, HORAS_POR_LECTURA
from historico.analitica.comparativa.consultas import _SQL_CURVA, _SQL_EMPAREJADO, _SQL_ENERGIA
from historico.analitica.comparativa.reduccion import reducir
from historico.analitica.correlacion import confianza_de
from historico.analitica.ventana import MES, TRUNC, Ventana


def arreglos(ventana: Ventana) -> dict:
    """Compara el arreglo inclinado (PV1) contra el vertical (PV2) en la ventana."""
    # Fuera del tramo con POA no hay un PR malo contra POA: no hay PR contra POA, y
    # se dice distinto. Se comprueba ANTES de consultar el emparejamiento, porque un
    # cociente sobre cero pares se lee igual que uno nulo de verdad. El PR contra GHI
    # no depende de la POA y se calcula igual. Es una comprobacion PURA (mira el
    # catalogo, no la base), asi que no cuesta un viaje ni obliga a esperar a nadie.
    sin_poa = catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta, *CLAVES_POA)
    por_mes = ventana.granularidad == MES

    # Este es el endpoint mas ANCHO de la consola: hasta seis consultas, todas
    # independientes entre si. En fila eran seis viajes al pooler (~1,35 s de puro
    # ida y vuelta) para un calculo que despues tarda milisegundos. Juntas cuestan
    # uno. Ver `db.en_paralelo` y la cabecera de `historico.db`.
    #
    # Las dos que pueden no hacer falta se sustituyen por una constante en vez de
    # sacarlas de la lista: asi el desempaquetado de abajo no cambia de forma segun
    # la ventana, que es donde se colaria un resultado en la variable equivocada.
    periodos, curva, meses_crudos, emparejado, dias_pr, confianza = db.en_paralelo(
        lambda: db.query(_SQL_ENERGIA,
                         (TRUNC[ventana.granularidad], HORAS_POR_LECTURA,
                          HORAS_POR_LECTURA) + ventana.sql),
        lambda: db.query(_SQL_CURVA, ventana.sql),
        lambda: ([] if por_mes else
                 db.query(_SQL_ENERGIA, (TRUNC[MES], HORAS_POR_LECTURA,
                                         HORAS_POR_LECTURA) + ventana.sql)),
        lambda: ({} if sin_poa else db.uno(_SQL_EMPAREJADO, ventana.sql)),
        lambda: rendimiento.consultar(ventana),
        lambda: confianza_de(ventana, *CLAVES),
    )
    # Con granularidad mensual los meses SON los periodos: se reusa la misma lista
    # en vez de pedirla dos veces, igual que antes.
    meses = periodos if por_mes else meses_crudos

    calculado = reducir(periodos, curva, dias_pr, meses,
                        ventana.granularidad, emparejado, sin_poa)
    return resultado.sobre(
        ventana, confianza, **calculado,
        nota=("PV1 = inclinado (20 grados / azimut 150), PV2 = vertical (90 / 50), "
              "1.420 Wp cada uno. La energia es la integral de la potencia corregida a "
              "5 min. La curva horaria esta en hora LOCAL de Costa Rica (los timestamps "
              "ya lo estan; no se convierte zona). El PR es DIARIO Y MENSUAL (R1) y sale "
              "de `analitica.rendimiento`: es el mismo numero que da la tool "
              "`performance_ratio`, nunca uno propio calculado cada 5 min."),
    )

"""Los 9 KPIs del dashboard contra la base, con su bloque de confianza."""
from __future__ import annotations

from datetime import date

from historico import db
from historico.analitica import energia, resultado
from historico.analitica.resumen.constantes import _FUENTE, COLUMNAS
from historico.analitica.resumen.consultas import _SQL_ULTIMO_EN_VENTANA, ultimo_global
from historico.analitica.resumen.kpis import componer
from historico.analitica.resumen.periodo import tramo, ventana_reciente
from historico.analitica.ventana import Ventana
from historico.calidad import contexto


def calcular(ventana: Ventana, hoy: date | None = None) -> dict:
    """Los 9 KPIs del dashboard para la ventana pedida, con su bloque de confianza."""
    # `hoy_en_sitio` se resuelve en la fachada: es donde vive su reloj sustituible.
    from historico.analitica import resumen as fachada

    desde, hasta = ventana.sql
    # Las CUATRO consultas del tablero son independientes entre si (la ventana
    # reciente se deriva del ultimo dato de la ventana, pero eso es aritmetica de
    # fechas y no otra consulta), asi que van juntas: en fila serian cuatro viajes al
    # pooler, ~900 ms de reloj solo en latencia. Ver `db.en_paralelo` y la cabecera de
    # `historico.db`. NO anidar: ninguna de las cuatro puede abrir su propia tanda.
    #
    # La cuarta es la frescura GLOBAL, sin filtro de fechas. Sale en la misma tanda
    # (nunca en fila detras de las otras) y ademas viene cacheada, asi que en la
    # practica no agrega viaje: ver `ultimo_global`.
    #
    # `confianza` ya cuenta los dias con datos del periodo: se reusa como divisor
    # del anualizado en vez de contarlos aparte, porque dos cuentas distintas de lo
    # mismo terminan discrepando y nadie lo nota hasta que ya decidio algo.
    fila, dias, confianza, global_ = db.en_paralelo(
        lambda: db.uno(_SQL_ULTIMO_EN_VENTANA, (desde, hasta)),
        lambda: energia.por_dia(ventana),
        lambda: contexto.confianza(desde, hasta, COLUMNAS, _FUENTE),
        ultimo_global,
    )
    en_ventana = fila.get("ultimo")
    reciente = ventana_reciente(ventana, en_ventana)
    confianza["vigilancia"] = energia.AVISO_VIGILANCIA
    return resultado.sobre(
        ventana, confianza,
        **componer(global_, en_ventana, dias, tramo(dias, reciente),
                   confianza["dias_con_datos"], hoy or fachada.hoy_en_sitio()),
        ventana_reciente=reciente.como_dict() if reciente else None,
    )

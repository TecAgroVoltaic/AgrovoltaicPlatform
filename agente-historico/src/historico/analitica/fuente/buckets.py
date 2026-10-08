"""La rejilla de buckets de una ventana (con los vacios) y su tope de puntos."""
from __future__ import annotations

from datetime import datetime, timedelta

from historico.analitica.ventana import DIA, HORA, MES, SEMANA, Ventana, VentanaInvalida

# Techo de puntos por grafico. Una ventana de 19 meses por hora son ~13.000 puntos
# que ni el navegador dibuja ni el ojo lee; `ventana.granularidad_sugerida` ya elige
# bien sola, asi que esto solo frena a quien fuerce la granularidad a mano.
MAXIMO_PUNTOS = 1500

# Clave de bucket, la misma en Python y en SQL para que se puedan cruzar.
FORMATO_BUCKET = "%Y-%m-%dT%H:%M"
FORMATO_BUCKET_SQL = 'YYYY-MM-DD"T"HH24:MI'


def validar_tamano(v: Ventana, maximo: int = MAXIMO_PUNTOS) -> None:
    """Rechaza la ventana ANTES de consultar si su granularidad la haria ilegible."""
    buckets = {HORA: v.dias * 24, DIA: v.dias, SEMANA: v.dias / 7, MES: v.dias / 28}
    if buckets[v.granularidad] > maximo:
        raise VentanaInvalida(
            "ventana_demasiado_fina",
            f"{v.dias} dias por {v.granularidad} pasan del techo de {maximo} puntos; "
            f"usa una granularidad mas gruesa o acorta la ventana",
        )


def rejilla(v: Ventana) -> list[datetime]:
    """TODOS los buckets de la ventana, tengan o no lecturas. Pura, sin base.

    Se arma aca y no con lo que devolvio el SQL porque una consulta solo puede
    mostrar los buckets que existen, y los que faltan son justamente el dato: el
    historico tiene 274 dias de un calendario de 569.
    """
    inicio = datetime(v.desde.year, v.desde.month, v.desde.day)
    fin = datetime(v.hasta.year, v.hasta.month, v.hasta.day)
    if v.granularidad == MES:
        buckets, t = [], inicio.replace(day=1)
        while t < fin:
            buckets.append(t)
            t = (t.replace(day=28) + timedelta(days=4)).replace(day=1)
        return buckets
    if v.granularidad == SEMANA:
        inicio -= timedelta(days=inicio.weekday())   # date_trunc('week') es lunes
    paso = {HORA: timedelta(hours=1), DIA: timedelta(days=1),
            SEMANA: timedelta(weeks=1)}[v.granularidad]
    buckets, t = [], inicio
    while t < fin:
        buckets.append(t)
        t += paso
    return buckets

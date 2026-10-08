"""Referencias ejecutables, en Python, de lo que el SQL integra y cierra por dia."""
from __future__ import annotations

from datetime import datetime

from historico.analitica.rendimiento.constantes import (
    DT_ULTIMA_FILA_SEG,
    MAXIMO_CONTADOR_DIARIO_KWH,
    SEGUNDOS_POR_HORA,
    TECHO_DT_SEG,
)


def integrar(lecturas: list[tuple[datetime, float | None]],
             techo_seg: float = TECHO_DT_SEG,
             dt_ultima_seg: float = DT_ULTIMA_FILA_SEG) -> dict:
    """Integra una serie instantanea a su unidad-hora con dt REAL acotado. PURA.

    Es la definicion autoritativa de la generalizacion del `5/60`, y el gemelo del
    `LEAST(COALESCE(lead(ts) - ts, DT_ULTIMA_FILA_SEG), TECHO_DT_SEG)` que el SQL
    ejecuta sobre la base por velocidad. Vive aca en Python porque esta regla ES la
    decision del modulo (es donde nos apartamos de la letra de R1), y una decision
    que solo se puede comprobar con la base de produccion delante no se comprueba.
    Las dos constantes salen de las mismas variables que interpola el SQL, asi que
    no hay dos numeros que puedan desincronizarse: hay uno.

    `lecturas` son pares (marca, valor) de UN dia; el salto nocturno no entra porque
    la particion es por dia, igual que en la consulta.
    """
    ordenadas = sorted(lecturas, key=lambda par: par[0])
    total, horas, n = 0.0, 0.0, 0
    for i, (marca, valor) in enumerate(ordenadas):
        siguiente = ordenadas[i + 1][0] if i + 1 < len(ordenadas) else None
        crudo = (siguiente - marca).total_seconds() if siguiente else dt_ultima_seg
        dt = min(crudo, techo_seg)
        horas += dt / SEGUNDOS_POR_HORA
        if valor is not None:
            total += valor * dt / SEGUNDOS_POR_HORA
            n += 1
    return {"total": total, "horas": horas, "n": n}


def cierre_del_contador(lecturas: list[tuple[datetime, float | None]]) -> float | None:
    """Con cuanto cierra el dia un acumulador DIARIO. PURA. Gemelo del `max()` del SQL.

    Es el MAXIMO del dia, y no el ultimo valor ni la diferencia entre extremos:

      * el acumulador **se reinicia a medianoche**, y ese salto negativo separa dos
        dias, no es una caida. Nunca se cuenta como tal porque las lecturas se
        agrupan por dia ANTES de llegar aca, igual que el `GROUP BY dia` del SQL;
      * un retroceso INTRA-dia si existe (reinicio del inversor al amanecer, caso
        real del 2026-04-24: 0,23 -> 0,02 -> 0,00 kWh). El maximo conserva lo ya
        acumulado; el ultimo valor lo perderia entero.

    Descarta lo que pase de `MAXIMO_CONTADOR_DIARIO_KWH`, que es el maximo fisico
    que el catalogo le declara al contador por arreglo. NO es la firma de
    contaminacion: esa mira la fila entera y vive en `analitica.contaminacion`. Aca
    llega una sola columna, asi que el tope por valor es la unica defensa
    disponible, y por eso los dos criterios conviven sin ser el mismo.
    """
    validas = [v for _, v in lecturas
               if v is not None and v <= MAXIMO_CONTADOR_DIARIO_KWH]
    return max(validas) if validas else None

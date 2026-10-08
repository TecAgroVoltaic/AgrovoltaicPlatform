"""Los 9 KPIs de cabecera del dashboard (Fig. 2 del documento de evaluacion).

Ultima actualizacion, energia del periodo y de los ultimos 7 dias (total y por
arreglo) y rendimiento especifico por arreglo. Cuatro decisiones que no son de estilo:

1. **La energia del tablero es AC y sale de los CONTADORES del inversor**, no de
   integrar la potencia DC. Es R7 de Leo Cardinale (2026-08-30) y ademas es lo
   unico que llena el tablero entre nov-2025 y feb-2026, donde `potencia_total_wac`
   esta al 100% en NULL y `energia_hoy_wh` tiene 13.922 lecturas en 118 dias. Toda
   esa cuenta vive en `analitica.energia`, que es tambien donde esta explicado por
   que esas columnas estan en kWh pese a llamarse `_wh`.
2. **Los "ultimos 7 dias" se cuentan contra el ULTIMO DIA CON DATOS DE LA VENTANA**,
   no contra hoy. Si la ventana no llega hasta hoy, o el logger se atraso, contra hoy
   los tres KPIs de 7 dias saldrian en cero, que es indistinguible de "el sistema no
   genero nada".
3. **La energia POR ARREGLO sigue siendo DC** (integral de `potencia_pv1_w` y
   `potencia_pv2_w`): las casillas 4 a 9 preguntan por el Inclinado y el Vertical,
   y el inversor no reporta AC por arreglo. Por eso el total AC y la suma de los
   dos arreglos no tienen por que coincidir, y el bloque `energia_ac` trae el
   control AC/DC que dice si la diferencia es la esperada.
4. **La frescura (`actualizacion`) se mide sobre TODA la base y NO sobre la ventana.**
   Es la unica casilla del tablero que responde una pregunta sobre el SISTEMA
   ("¿la planta sigue reportando?") y no sobre el periodo elegido. Ver la nota
   larga de `evaluar_frescura`: acotarla al rango es un error que se comete solo.


El SQL de la energia vive entero en `analitica.energia.por_dia` (una sola consulta,
un renglon por dia) y el criterio en funciones puras (`frescura`, `periodo`, `kpis`),
que se prueban sin base de datos. Este `__init__` es la fachada del paquete y el
dueño del reloj del sitio (`hoy_en_sitio`), que se sustituye en las pruebas.
"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from historico import config


def hoy_en_sitio() -> date:
    """El dia de HOY en el sitio, no el de la maquina. El servidor corre en UTC:
    con el reloj de la maquina, desde las 18:00 de Costa Rica ya seria manana y el dato
    de hoy apareceria con un dia de atraso que no tiene."""
    return datetime.now(ZoneInfo(config.TZ)).date()


from historico.analitica.resumen.calculo import calcular  # noqa: E402,F401
from historico.analitica.resumen.constantes import (  # noqa: E402,F401
    _FUENTE, _KWP_POR_ARREGLO, _NOTA, AL_DIA, COLUMNAS, DETENIDA, DIAS_ANTIGUEDAD_ALARMANTE,
    DIAS_ANTIGUEDAD_TOLERABLE, DIAS_POR_ANO, DIAS_VENTANA_RECIENTE, POTENCIA_NOMINAL_WP,
    REZAGADA, SIN_DATOS,
)
from historico.analitica.resumen.consultas import (  # noqa: E402,F401
    _CACHE, _CLAVE_ULTIMO_GLOBAL, _HAY_DATO, _SQL_ULTIMO_EN_VENTANA, _SQL_ULTIMO_GLOBAL,
    ultimo_global,
)
from historico.analitica.resumen.frescura import _dia, cierre_del_periodo, evaluar_frescura  # noqa: E402,F401
from historico.analitica.resumen.kpis import componer, energias, rendimiento  # noqa: E402,F401
from historico.analitica.resumen.periodo import tramo, ventana_reciente  # noqa: E402,F401

"""La energia AC del tablero, leida de los CONTADORES del inversor (R7 de Leo).

R7, verbatim (2026-08-30): "Tenemos dos: energia_hoy y Energia total. Ambas son
energias totales en AC. Sera siempre un poco menor a la suma de las de PV1 y PV2
porque consideran las perdidas del inversor."

La casilla de energia NO sale de integrar la potencia DC. Sale de `energia_hoy_wh`
(se reinicia cada dia) y de `energia_total_wh` (contador de vida). Cuatro hechos
MEDIDOS contra produccion (`docs/referencia/medicion-energia-ac.md`) decidieron el
resto, y los cuatro son contraintuitivos:

**1. Las cuatro columnas `energia_*_wh` estan en kWh, pese al sufijo del nombre.**
Ver `KWH_POR_UNIDAD`. Es el error mas facil de cometer aca y vale un factor de mil.

**2. El hueco de cuatro meses del tablero AC no existe.** `energia_hoy_wh` tiene
13.922 lecturas en 118 dias entre nov-2025 y feb-2026, justo donde
`potencia_total_wac`, `energia_total_wh`, `energia_pv1_wh` y `energia_pv2_wh` estan
al 100% en NULL. Por eso la fuente primaria de la casilla es `energia_hoy_wh` y no
`energia_total_wh`: es la unica que cubre esa ventana. Espejo del mismo fenomeno:
noviembre 2024 tiene AC y cero DC.

**3. Hay DOS totales distintos y los dos son correctos.** "Cuanto registramos" y
"cuanto produjo la planta" son preguntas distintas y las dos importan, asi que las
dos salen con su nombre (ver `_SIGNIFICADO`). El contador de vida es el UNICO
numero del sistema que ve los huecos: de los 2.528,40 kWh que reconstruye, solo
905,55 caen en dias que tenemos registrados.

**4. Control de sanidad, y es la prediccion de Leo:** la razon AC/DC contador
contra contador da mediana 0,958 sobre 129 dias, por las perdidas del inversor. Si
el AC sale sistematicamente MAYOR que el DC, algo esta mal en la implementacion.
Va en el payload (`coherencia_ac_dc`) para que se pueda mirar sin correr un test.

Los timestamps son hora local de Costa Rica etiquetada `+00`: `timestamp::date` ya
da la fecha local y aca no hay ni un `AT TIME ZONE`. Ver `ventana.py`.

Repartido por responsabilidad, y todo se sigue leyendo como `energia.<nombre>`:
`energia_contadores` (unidades y contadores), `energia_dc` (DC por arreglo y
coherencia AC/DC), `energia_resumen` (las dos energias AC) y `energia_sql` (la
consulta por dia).
"""
from __future__ import annotations

from historico import db
from historico.analitica import catalogo, contaminacion, resultado
from historico.analitica.correlacion import confianza_de
from historico.analitica.energia_contadores import (  # noqa: F401
    CIERRE_DIARIO, KWH_POR_UNIDAD, TOLERANCIA_REINICIO_KWH, UNIDAD, a_kwh,
    cierre_por_dia, cierres_ac, reconstruir, tramos_vida,
)
from historico.analitica.energia_dc import (  # noqa: F401
    _CAMPOS_DC, DC_MINIMO_PARA_COMPARAR_KWH, HORAS_POR_FILA, INCLINADO, VERTICAL,
    WH_POR_KWH, _percentil, coherencia_ac_dc, integral_dc,
)
from historico.analitica.energia_resumen import _SIGNIFICADO, resumir  # noqa: F401
from historico.analitica.energia_sql import _SQL_POR_DIA, por_dia  # noqa: F401
from historico.analitica.ventana import Ventana

# De que columnas depende cada respuesta. Se le pasan a `confianza` para que el
# veredicto mire SOLO esas y no condene el periodo por una columna ajena rota.
COLUMNAS_AC = ["energia_hoy_wh", "energia_total_wh"]
COLUMNAS_DC = ["potencia_pv1_w", "potencia_pv2_w"]
COLUMNAS = COLUMNAS_AC + COLUMNAS_DC
# La tabla con cuyo nombre el barrido etiqueta sus hallazgos, que es la CRUDA y no
# la vista. Sale de `contaminacion` para que no haya dos literales que separar.
FUENTE = contaminacion.TABLA_CRUDA


def _aviso_vigilancia() -> str:
    """Que puede y que no puede castigar el bloque de confianza. DERIVADO, no escrito.

    Aca habia una frase a mano: "el barrido no revisa `energia_hoy_wh` ni
    `energia_total_wh`". Era cierta y dejo de serlo el 2026-08-31, cuando el catalogo
    registro las cuatro columnas de energia y las puso en `_VIGILADAS`. Se deriva del
    catalogo justamente para que una frase no pueda sobrevivir a la decision que
    describe, que es lo que le paso a la anterior: "cero hallazgos" y "nadie la miro"
    se ven igual en el payload, y afirmar la segunda cuando ya es falsa desperdicia
    la unica señal que distinguia los dos casos.
    """
    ciegas = catalogo.sin_vigilancia(*COLUMNAS)
    if ciegas:
        return (f"el barrido de calidad no revisa {', '.join(ciegas)}: que no tengan "
                f"hallazgos NO significa que esten sanas, significa que nadie las "
                f"reviso. La confianza de arriba solo puede castigar esas columnas "
                f"por hallazgos de dia entero")
    return ("el barrido de calidad SI revisa las columnas de las que sale esta "
            "respuesta: la confianza de arriba las castiga por sus propios hallazgos "
            "y no solo por los de dia entero. Un periodo sin hallazgos aca es un "
            "periodo revisado, no un periodo que nadie miro")


AVISO_VIGILANCIA = _aviso_vigilancia()


def calcular(ventana: Ventana) -> dict:
    """La energia AC del periodo, con su bloque de confianza.

    La confianza se pide por CLAVE de catalogo (`confianza_de`) y no traduciendo a
    mano a nombre de columna: hacerlo a mano en cada modulo fue como aparecio el
    fallo que perdia 321 hallazgos de irradiancia. Aca la clave y la columna cruda
    se llaman igual, asi que hoy da lo mismo; hacerlo por la puerta unica es lo que
    hace que siga dando lo mismo si alguna vez dejan de llamarse igual.
    """
    # Las dos consultas del endpoint son INDEPENDIENTES, asi que salen a la vez: en
    # fila costaban dos viajes al pooler (~450 ms) para calcular exactamente lo
    # mismo. Ver `db.en_paralelo` y la cabecera de `historico.db`.
    confianza, dias = db.en_paralelo(
        lambda: confianza_de(ventana, *COLUMNAS_AC),
        lambda: por_dia(ventana),
    )
    confianza["vigilancia"] = AVISO_VIGILANCIA
    return resultado.sobre(
        ventana, confianza, **resumir(dias),
        # El hueco de cobertura viaja con el numero: `energia_total_wh` no existe
        # entre nov-2025 y feb-2026, y un total de ese periodo es correcto y a la vez
        # engañoso si nadie dice de donde falta.
        cobertura=catalogo.huecos(*COLUMNAS_AC),
    )
